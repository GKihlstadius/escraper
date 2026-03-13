import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

function tokenOverlapScore(a: string, b: string): number {
  const STRIP = new Set(['inkl', 'inklusive', 'med', 'plus', 'onesize', 'one-size', '2024', '2025', '2023', '2022', '2026',
    'essential', 'authentic', 'fresh', 'twillic', 'cab', 'bilbarnstol', 'bilstol', 'bälteskudde', 'bältesstol',
    'barnvagn', 'duovagn', 'sittvagn', 'syskonvagn', 'joggingvagn', 'liggvagn', 'sulky', 'buggy', 'kombivagn',
    'barnvagnspaket', 'vagnspaket', 'paket', 'komplett', 'set', 'babyskydd', 'i-size', 'r129', 'r44',
    'och', 'för', 'till', 'med', 'av', 'den', 'det', 'nya', 'stroller', 'pushchair', 'pram', 'car', 'seat']);
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w\såäöé-]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(/\s+/).filter(w => w.length > 1 && !STRIP.has(w));
  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) { if (tokensB.has(t)) overlap++; }
  return overlap / Math.min(tokensA.size, tokensB.size);
}

async function main() {
  const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
  const compMap = new Map((comps || []).map(c => [c.id, c]));
  const ownIds = new Set((comps || []).filter(c => c.is_own_store).map(c => c.id));

  const { data: variants } = await sb.from('product_variants').select('id, product_id');
  const varToProduct = new Map((variants || []).map(v => [v.id, v.product_id]));

  const { data: products } = await sb.from('products').select('id, name, brand, normalized_name').eq('is_active', true);
  const prodMap = new Map((products || []).map(p => [p.id, p]));

  const { data: prices } = await sb.from('product_prices').select('variant_id, competitor_id, price').order('scraped_at', { ascending: false });

  // latest per variant+competitor
  const latest = new Map<string, number>();
  for (const p of prices || []) {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (!latest.has(key)) latest.set(key, p.price);
  }

  // Group products by own vs competitor
  const ownProducts = new Map<string, { name: string; brand: string; price: number }>();
  const compProducts = new Map<string, { name: string; brand: string; price: number; compName: string }>();

  for (const [key, price] of latest) {
    const [vid, cid] = key.split(':');
    const pid = varToProduct.get(vid);
    if (!pid) continue;
    const prod = prodMap.get(pid);
    if (!prod) continue;

    if (ownIds.has(cid)) {
      if (!ownProducts.has(pid)) ownProducts.set(pid, { name: prod.name, brand: prod.brand, price });
    } else {
      if (!compProducts.has(pid)) compProducts.set(pid, { name: prod.name, brand: prod.brand, price, compName: compMap.get(cid)?.name || '?' });
    }
  }

  // Own products without competitor matches
  console.log('=== EGNA PRODUKTER UTAN KONKURRENTMATCH ===');
  const unmatchedOwn: { id: string; name: string; brand: string }[] = [];
  for (const [pid, data] of ownProducts) {
    if (!compProducts.has(pid)) {
      unmatchedOwn.push({ id: pid, name: data.name, brand: data.brand });
      console.log(`  ${data.brand} — ${data.name}`);
    }
  }

  // Competitor products without own matches
  console.log('\n=== KONKURRENTPRODUKTER UTAN EGEN MATCH ===');
  const unmatchedComp: { id: string; name: string; brand: string; compName: string }[] = [];
  for (const [pid, data] of compProducts) {
    if (!ownProducts.has(pid)) {
      unmatchedComp.push({ id: pid, name: data.name, brand: data.brand, compName: data.compName });
      console.log(`  [${data.compName}] ${data.brand} — ${data.name}`);
    }
  }

  // Try to find potential matches between unmatched own and competitor products
  console.log('\n=== POTENTIELLA MATCHNINGAR (token overlap ≥ 0.5) ===');
  let potentialMatches = 0;
  for (const own of unmatchedOwn) {
    const candidates: { comp: typeof unmatchedComp[0]; score: number }[] = [];
    for (const comp of unmatchedComp) {
      if (own.brand.toLowerCase().replace(/[\s-]+/g, '') !== comp.brand.toLowerCase().replace(/[\s-]+/g, '')) continue;
      const score = tokenOverlapScore(own.name, comp.name);
      if (score >= 0.5) {
        candidates.push({ comp, score });
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      for (const c of candidates) {
        console.log(`  ${own.brand} "${own.name}" <-> "${c.comp.name}" [${c.comp.compName}] (score: ${c.score.toFixed(2)})`);
        potentialMatches++;
      }
    }
  }
  console.log(`\nPotentiella matchningar: ${potentialMatches}`);

  // Check brand mismatches (same product different brand names)
  console.log('\n=== VARUMÄRKEN HOS EGNA vs KONKURRENTER ===');
  const ownBrands = new Set([...ownProducts.values()].map(p => p.brand));
  const compBrands = new Set([...compProducts.values()].map(p => p.brand));
  const ownOnly = [...ownBrands].filter(b => !compBrands.has(b)).sort();
  const compOnly = [...compBrands].filter(b => !ownBrands.has(b)).sort();
  console.log('Bara hos oss:', ownOnly.join(', '));
  console.log('Bara hos konkurrenter:', compOnly.join(', '));
}

main().catch(console.error);
