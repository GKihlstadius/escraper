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

  const { message } = await request.json();
  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Gather context from database
  const [productsRes, alertsRes, recommendationsRes, competitorsRes] = await Promise.all([
    supabase.from('products').select(`
      name, brand, category,
      variants:product_variants(
        color, variant_name,
        prices:product_prices(
          price, original_price, in_stock, url, scraped_at,
          competitor:competitors(name, is_own_store)
        )
      )
    `).eq('is_active', true).limit(50),

    supabase.from('alerts')
      .select('type, severity, title, message, created_at')
      .order('created_at', { ascending: false })
      .limit(20),

    supabase.from('price_recommendations')
      .select('current_price, recommended_price, reason, status, created_at')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(10),

    supabase.from('competitors')
      .select('name, url, is_own_store, is_active'),
  ]);

  const context = buildContext(
    productsRes.data || [],
    alertsRes.data || [],
    recommendationsRes.data || [],
    competitorsRes.data || []
  );

  // Call Groq API (free tier)
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json({
      reply: 'AI-chatt är inte konfigurerad. Sätt GROQ_API_KEY i miljövariabler.',
    });
  }

  const systemPrompt = `Du är en prisanalytiker för en svensk e-handlare som säljer barnvagnar och bilstolar.
Du hjälper kunden analysera priser, konkurrenter och trender.
Svara alltid på svenska. Var konkret och hänvisa till specifik data.
Här är aktuell data från systemet:

${context}`;

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  const groqData = await groqRes.json();
  const reply = groqData.choices?.[0]?.message?.content || 'Kunde inte generera svar.';

  return NextResponse.json({ reply });
}

function buildContext(
  products: unknown[],
  alerts: unknown[],
  recommendations: unknown[],
  competitors: unknown[]
): string {
  let ctx = '## Konkurrenter\n';
  for (const c of competitors as Array<Record<string, unknown>>) {
    ctx += `- ${c.name} (${c.is_own_store ? 'Egen butik' : 'Konkurrent'}) ${c.is_active ? '✓' : '✗'}\n`;
  }

  ctx += '\n## Senaste larm\n';
  for (const a of alerts as Array<Record<string, unknown>>) {
    ctx += `- [${a.severity}] ${a.title}: ${a.message} (${a.created_at})\n`;
  }

  ctx += '\n## Prisrekommendationer (väntande)\n';
  for (const r of recommendations as Array<Record<string, unknown>>) {
    ctx += `- ${r.reason} | Nuvarande: ${r.current_price} SEK → Rekommenderat: ${r.recommended_price} SEK\n`;
  }

  ctx += '\n## Produkter och priser\n';
  for (const p of (products as Array<Record<string, unknown>>).slice(0, 30)) {
    ctx += `\n### ${p.name} (${p.brand}, ${p.category})\n`;
    const variants = p.variants as Array<Record<string, unknown>> || [];
    for (const v of variants) {
      const prices = v.prices as Array<Record<string, unknown>> || [];
      if (prices.length > 0) {
        ctx += `  Variant: ${v.variant_name}\n`;
        for (const pr of prices.slice(0, 5)) {
          const comp = pr.competitor as Record<string, unknown>;
          ctx += `    ${comp?.name}: ${pr.price} SEK${pr.original_price ? ` (ord. ${pr.original_price})` : ''} ${pr.in_stock ? '✓' : 'Slut'}\n`;
        }
      }
    }
  }

  return ctx;
}
