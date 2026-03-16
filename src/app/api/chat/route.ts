import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // Auth check
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { message, history, conversationId } = await request.json();
  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Gather rich context from database (including memories)
  const [productsRes, alertsRes, recommendationsRes, competitorsRes, lastScrapeRes, memoriesRes] = await Promise.all([
    supabase.from('products').select(`
      id, name, brand, category,
      variants:product_variants(
        id, color, variant_name,
        prices:product_prices(
          price, original_price, in_stock, url, scraped_at,
          competitor:competitors(name, is_own_store)
        )
      )
    `).eq('is_active', true).limit(500),

    supabase.from('alerts')
      .select('type, severity, title, message, created_at')
      .order('created_at', { ascending: false })
      .limit(30),

    supabase.from('price_recommendations')
      .select(`
        current_price, recommended_price, reason, status, created_at,
        product:products(name, brand),
        competitor:competitors(name)
      `)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(20),

    supabase.from('competitors')
      .select('id, name, url, is_own_store, is_active'),

    supabase.from('scraping_logs')
      .select('created_at, status, products_scraped, message')
      .order('created_at', { ascending: false })
      .limit(3),

    supabase.from('chat_memories')
      .select('id, category, content')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50),
  ]);

  const products = productsRes.data || [];
  const competitors = competitorsRes.data || [];
  const ownStoreIds = new Set(competitors.filter((c: any) => c.is_own_store).map((c: any) => c.id));

  const memories = memoriesRes.data || [];

  const context = buildContext(
    products,
    alertsRes.data || [],
    recommendationsRes.data || [],
    competitors,
    lastScrapeRes.data || [],
    ownStoreIds,
    memories,
  );

  // Call Groq API
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json({
      reply: 'AI-chatt är inte konfigurerad. Sätt GROQ_API_KEY i miljövariabler.',
    });
  }

  const systemPrompt = `Du är en expert prisanalytiker och rådgivare för en svensk e-handlare som driver butikerna KöpBarnvagn och Bonti. De säljer barnvagnar och bilstolar.

DITT UPPDRAG:
- Hjälp ägaren förstå sin prisposition mot konkurrenter
- Ge konkreta, handlingsbara råd baserat på datan
- Identifiera risker (vi är för dyra) och möjligheter (vi kan höja priset)
- Svara alltid på svenska, var koncis och direkt

NÄR ANVÄNDAREN FRÅGAR "VAD BÖR JAG SÄNKA?":
- Lista produkter där vi är dyrare än konkurrenter, sorterat efter störst prisskillnad
- Visa vårt pris vs billigaste konkurrent och vilken butik
- Föreslå nytt pris (slå konkurrenten med ~1%)
- Prioritera produkter med hög efterfrågan / kända varumärken

NÄR ANVÄNDAREN FRÅGAR "VAD BÖR JAG HÅLLA KOLL PÅ?":
- Flagga senaste prisändringar hos konkurrenter
- Identifiera trender (flera sänkningar = kampanj?)
- Visa produkter där konkurrenter närmar sig vårt pris
- Larm om lagerförändringar som kan påverka marknaden

NÄR ANVÄNDAREN FRÅGAR OM EN SPECIFIK PRODUKT:
- Visa pris hos varje butik
- Visa prishistorik och trender
- Rekommendera prisstrategi

REGLER:
- Hänvisa alltid till specifika produktnamn och priser
- Avrunda priser till hela kronor
- Om data saknas, säg det ärligt
- Ge max 5-7 produkter per lista, de viktigaste först

MINNE:
Du har tillgång till sparade minnen från tidigare konversationer. Använd dessa för att ge mer personliga och relevanta svar. Om användaren ber dig "kom ihåg" något, bekräfta det i ditt svar.

${context}`;

  // Build messages array with conversation history for multi-turn context
  const chatMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  if (Array.isArray(history) && history.length > 0) {
    // Add prior messages (skip the system greeting)
    for (const h of history.slice(0, -1)) {
      if (h.role === 'user' || h.role === 'assistant') {
        chatMessages.push({ role: h.role, content: h.content });
      }
    }
  }
  chatMessages.push({ role: 'user', content: message });

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: chatMessages,
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  const groqData = await groqRes.json();
  const reply = groqData.choices?.[0]?.message?.content || 'Kunde inte generera svar.';

  // Extract memories in the background (don't block the response)
  extractMemories(groqApiKey, user.id, message, reply, conversationId || null, supabase).catch(() => {});

  return NextResponse.json({ reply });
}

// Use a separate fast LLM call to extract memorable facts from the conversation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractMemories(
  groqApiKey: string,
  userId: string,
  userMessage: string,
  assistantReply: string,
  conversationId: string | null,
  supabase: any,
) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `Du analyserar konversationer och extraherar viktiga fakta att minnas för framtida samtal.

Svara ENBART med en JSON-array av minnen. Varje minne har:
- "category": en av "fact", "preference", "decision", "context"
- "content": en kort mening som beskriver vad som ska sparas

Kategorier:
- fact: Fakta om användarens verksamhet, produkter, eller marknaden
- preference: Användarens preferenser för priser, strategi, eller kommunikation
- decision: Beslut användaren har tagit (t.ex. "sänkt priset på X")
- context: Viktig bakgrundsinformation

REGLER:
- Extrahera BARA om det finns något värt att minnas (inte varje meddelande har det)
- Svara med tom array [] om inget är minnesvärt
- Max 2 minnen per meddelande
- Skriv på svenska
- Formulera i tredje person ("Användaren vill...", "Butiken har...")
- Inkludera INTE prisdata eller statistik som ändras ofta
- Fokusera på strategi, beslut och preferenser`,
          },
          {
            role: 'user',
            content: `Användare: ${userMessage}\n\nAssistent: ${assistantReply}`,
          },
        ],
        temperature: 0,
        max_tokens: 500,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    // Parse the JSON array from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const memories: Array<{ category: string; content: string }> = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(memories) || memories.length === 0) return;

    const validCategories = ['fact', 'preference', 'decision', 'context'];
    for (const mem of memories.slice(0, 2)) {
      if (!mem.content || !validCategories.includes(mem.category)) continue;

      // Check for duplicate/similar memories
      const { data: existing } = await supabase
        .from('chat_memories')
        .select('id, content')
        .eq('user_id', userId)
        .eq('category', mem.category);

      const isDuplicate = existing?.some((e: { id: string; content: string }) =>
        e.content.toLowerCase().includes(mem.content.toLowerCase().slice(0, 30)) ||
        mem.content.toLowerCase().includes(e.content.toLowerCase().slice(0, 30))
      );

      if (isDuplicate) continue;

      await supabase.from('chat_memories').insert({
        user_id: userId,
        category: mem.category,
        content: mem.content,
        source_conversation_id: conversationId,
      });
    }
  } catch {
    // Silent fail — memory extraction is non-critical
  }
}

function buildContext(
  products: any[],
  alerts: any[],
  recommendations: any[],
  competitors: any[],
  scrapes: any[],
  ownStoreIds: Set<string>,
  memories: any[] = [],
): string {
  let ctx = '';

  // ── Memories from previous conversations ──
  if (memories.length > 0) {
    ctx += '## Minnen från tidigare konversationer\n';
    const byCategory = new Map<string, string[]>();
    for (const m of memories) {
      if (!byCategory.has(m.category)) byCategory.set(m.category, []);
      byCategory.get(m.category)!.push(m.content);
    }
    const labels: Record<string, string> = {
      fact: 'Fakta', preference: 'Preferenser', decision: 'Beslut', context: 'Kontext',
    };
    for (const [cat, items] of byCategory) {
      ctx += `### ${labels[cat] || cat}\n`;
      for (const item of items) ctx += `- ${item}\n`;
    }
    ctx += '\n';
  }

  // ── Competitors overview ──
  ctx += '## Butiker\n';
  for (const c of competitors) {
    ctx += `- ${c.name} (${c.is_own_store ? 'EGEN BUTIK' : 'Konkurrent'}) ${c.is_active ? '' : '[Inaktiv]'}\n`;
  }

  // ── Price position analysis ──
  const priceComparisons: Array<{
    product: string;
    brand: string;
    ourPrice: number;
    ourStore: string;
    cheapestPrice: number;
    cheapestStore: string;
    diff: number;
    diffPct: number;
  }> = [];

  const weAreCheaper: Array<{ product: string; brand: string; ourPrice: number; theirPrice: number; store: string }> = [];

  for (const p of products) {
    for (const v of (p.variants || [])) {
      const prices = v.prices || [];
      if (prices.length < 2) continue;

      // Filter out stale prices (older than 14 days)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);

      // Get latest price per competitor (only recent data)
      const latestByStore = new Map<string, { price: number; store: string; isOwn: boolean; scrapedAt: string }>();
      for (const pr of prices) {
        const comp = pr.competitor;
        if (!comp) continue;
        if (new Date(pr.scraped_at) < cutoff) continue; // skip stale prices
        const key = comp.name;
        const existing = latestByStore.get(key);
        if (!existing || new Date(pr.scraped_at) > new Date(existing.scrapedAt)) {
          latestByStore.set(key, { price: pr.price, store: comp.name, isOwn: comp.is_own_store, scrapedAt: pr.scraped_at });
        }
      }

      let ourPrice: number | null = null;
      let ourStore = '';
      let cheapestCompetitor: { price: number; store: string } | null = null;

      for (const [, info] of latestByStore) {
        if (info.isOwn) {
          if (ourPrice === null || info.price < ourPrice) {
            ourPrice = info.price;
            ourStore = info.store;
          }
        } else {
          if (!cheapestCompetitor || info.price < cheapestCompetitor.price) {
            cheapestCompetitor = { price: info.price, store: info.store };
          }
        }
      }

      if (ourPrice === null || !cheapestCompetitor) continue;

      const diff = ourPrice - cheapestCompetitor.price;
      const diffPct = (diff / cheapestCompetitor.price) * 100;

      if (diff > 0) {
        priceComparisons.push({
          product: `${p.brand} ${p.name}${v.color ? ` (${v.color})` : ''}`,
          brand: p.brand,
          ourPrice,
          ourStore,
          cheapestPrice: cheapestCompetitor.price,
          cheapestStore: cheapestCompetitor.store,
          diff,
          diffPct,
        });
      } else if (diff < -50) {
        weAreCheaper.push({
          product: `${p.brand} ${p.name}${v.color ? ` (${v.color})` : ''}`,
          brand: p.brand,
          ourPrice,
          theirPrice: cheapestCompetitor.price,
          store: cheapestCompetitor.store,
        });
      }
    }
  }

  // Sort: biggest price gap first
  priceComparisons.sort((a, b) => b.diff - a.diff);
  weAreCheaper.sort((a, b) => (a.ourPrice - a.theirPrice) - (b.ourPrice - b.theirPrice));

  // ── Products we should lower ──
  ctx += `\n## PRODUKTER DÄR VI ÄR DYRARE (${priceComparisons.length} st)\n`;
  for (const pc of priceComparisons.slice(0, 20)) {
    ctx += `- ${pc.product}: Vårt pris ${Math.round(pc.ourPrice)} kr (${pc.ourStore}) vs ${Math.round(pc.cheapestPrice)} kr (${pc.cheapestStore}) → vi är ${Math.round(pc.diff)} kr dyrare (+${pc.diffPct.toFixed(1)}%)\n`;
  }

  // ── Products where we're cheaper (opportunity to raise) ──
  if (weAreCheaper.length > 0) {
    ctx += `\n## PRODUKTER DÄR VI ÄR BILLIGARE (möjlighet att höja, ${weAreCheaper.length} st)\n`;
    for (const wc of weAreCheaper.slice(0, 10)) {
      ctx += `- ${wc.product}: Vårt pris ${Math.round(wc.ourPrice)} kr vs ${Math.round(wc.theirPrice)} kr (${wc.store})\n`;
    }
  }

  // ── Summary stats ──
  const totalProducts = products.length;
  const totalWithPrices = priceComparisons.length + weAreCheaper.length;
  ctx += `\n## Sammanfattning\n`;
  ctx += `- Totalt ${totalProducts} produkter i systemet\n`;
  ctx += `- ${priceComparisons.length} produkter där vi är dyrare än konkurrenter\n`;
  ctx += `- ${weAreCheaper.length} produkter där vi är billigare\n`;

  // ── Pending recommendations ──
  if (recommendations.length > 0) {
    ctx += `\n## Väntande prisrekommendationer (${recommendations.length} st)\n`;
    for (const r of recommendations) {
      const prod = r.product as any;
      const comp = r.competitor as any;
      ctx += `- ${prod?.brand || ''} ${prod?.name || 'Okänd'}: ${Math.round(r.current_price)} kr → ${Math.round(r.recommended_price)} kr (${r.reason})\n`;
    }
  }

  // ── Price history (detect trends over 30 days) ──
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const priceChanges: Array<{ product: string; store: string; oldPrice: number; newPrice: number; change: number; date: string }> = [];
  const storeTrends = new Map<string, { drops: number; raises: number; brands: Set<string> }>();

  for (const p of products) {
    for (const v of (p.variants || [])) {
      const prices = v.prices || [];
      // Group by store and detect changes
      const byStore = new Map<string, Array<{ price: number; date: string }>>();
      for (const pr of prices) {
        const comp = pr.competitor;
        if (!comp) continue;
        if (new Date(pr.scraped_at) < thirtyDaysAgo) continue;
        if (!byStore.has(comp.name)) byStore.set(comp.name, []);
        byStore.get(comp.name)!.push({ price: pr.price, date: pr.scraped_at });
      }
      for (const [store, history] of byStore) {
        if (history.length < 2) continue;
        history.sort((a, b) => a.date.localeCompare(b.date));
        // Detect all price changes (not just last 2)
        for (let i = 1; i < history.length; i++) {
          if (history[i].price !== history[i - 1].price) {
            const change = history[i].price - history[i - 1].price;
            priceChanges.push({
              product: `${p.brand} ${p.name}`,
              store,
              oldPrice: history[i - 1].price,
              newPrice: history[i].price,
              change,
              date: history[i].date,
            });
            // Track store trends
            if (!storeTrends.has(store)) storeTrends.set(store, { drops: 0, raises: 0, brands: new Set() });
            const trend = storeTrends.get(store)!;
            if (change < 0) trend.drops++;
            else trend.raises++;
            trend.brands.add(p.brand || 'Okänt');
          }
        }
      }
    }
  }

  // Store trend summary
  if (storeTrends.size > 0) {
    ctx += `\n## Pristrender (senaste 30 dagarna)\n`;
    for (const [store, trend] of storeTrends) {
      if (trend.drops + trend.raises >= 3) {
        const brands = [...trend.brands].slice(0, 3).join(', ');
        if (trend.drops > trend.raises * 2) {
          ctx += `- ${store}: ${trend.drops} prissänkningar (${brands}) → trolig kampanj\n`;
        } else if (trend.raises > trend.drops * 2) {
          ctx += `- ${store}: ${trend.raises} prishöjningar (${brands}) → möjligen nya inköpspriser\n`;
        } else {
          ctx += `- ${store}: ${trend.drops} sänkningar, ${trend.raises} höjningar (${brands})\n`;
        }
      }
    }
  }

  // Recent price changes (last 7 days only, sorted by magnitude)
  const recentChanges = priceChanges
    .filter(pc => new Date(pc.date) > sevenDaysAgo)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  if (recentChanges.length > 0) {
    ctx += `\n## Senaste prisändringar - 7 dagar (${recentChanges.length} st)\n`;
    for (const pc of recentChanges.slice(0, 20)) {
      const dir = pc.change > 0 ? '↑' : '↓';
      const date = new Date(pc.date).toLocaleDateString('sv-SE');
      ctx += `- ${pc.product} hos ${pc.store}: ${Math.round(pc.oldPrice)} → ${Math.round(pc.newPrice)} kr (${dir}${Math.abs(Math.round(pc.change))} kr) [${date}]\n`;
    }
  }

  // ── Recent alerts ──
  ctx += `\n## Senaste larm (${alerts.length} st)\n`;
  for (const a of alerts.slice(0, 15)) {
    ctx += `- [${a.type}/${a.severity}] ${a.title}: ${a.message}\n`;
  }

  // ── Last scraping status ──
  if (scrapes.length > 0) {
    ctx += '\n## Senaste scraping\n';
    for (const s of scrapes) {
      ctx += `- ${new Date(s.created_at).toLocaleString('sv-SE')}: ${s.status} — ${s.message}\n`;
    }
  }

  return ctx;
}
