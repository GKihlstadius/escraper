import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  const { count: prodCount } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
  const { count: varCount } = await sb.from('product_variants').select('id', { count: 'exact', head: true });
  const { count: priceCount } = await sb.from('product_prices').select('id', { count: 'exact', head: true });

  console.log('=== ÖVERSIKT ===');
  console.log('Produkter:', prodCount);
  console.log('Varianter:', varCount);
  console.log('Prisrader:', priceCount);

  const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
  const compNameMap = new Map((comps || []).map(c => [c.id, c.name]));

  console.log('\n=== BUTIKER ===');
  for (const c of comps || []) {
    const { count } = await sb.from('product_prices').select('id', { count: 'exact', head: true }).eq('competitor_id', c.id);
    console.log((c.is_own_store ? '★ ' : '  ') + c.name + ': ' + count + ' prisrader');
  }

  const { data: variants } = await sb.from('product_variants').select('id, product_id');
  const variantToProduct = new Map((variants || []).map(v => [v.id, v.product_id]));
  const ownIds = new Set((comps || []).filter(c => c.is_own_store).map(c => c.id));

  const { data: prices } = await sb.from('product_prices').select('variant_id, competitor_id');
  const ownProducts = new Set<string>();
  const compProducts = new Map<string, Set<string>>();

  for (const p of prices || []) {
    const pid = variantToProduct.get(p.variant_id);
    if (!pid) continue;
    if (ownIds.has(p.competitor_id)) ownProducts.add(pid);
    else {
      if (!compProducts.has(pid)) compProducts.set(pid, new Set());
      compProducts.get(pid)?.add(compNameMap.get(p.competitor_id) || '?');
    }
  }

  const bothCount = [...ownProducts].filter(pid => compProducts.has(pid)).length;
  const ownOnly = [...ownProducts].filter(pid => !compProducts.has(pid)).length;
  const compOnly = [...compProducts.keys()].filter(pid => !ownProducts.has(pid)).length;

  console.log('\n=== MATCHNING ===');
  console.log('Egna + konkurrent (jämförbara):', bothCount);
  console.log('Bara egna (ingen konkurrent):', ownOnly);
  console.log('Bara konkurrent (inte hos oss):', compOnly);

  const dist: Record<number, number> = {};
  for (const pid of ownProducts) {
    const n = compProducts.has(pid) ? (compProducts.get(pid)?.size || 0) : 0;
    dist[n] = (dist[n] || 0) + 1;
  }
  console.log('\n=== KONKURRENTER PER EGEN PRODUKT ===');
  for (const [n, count] of Object.entries(dist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(n + ' konkurrenter: ' + count + ' produkter');
  }

  const compMatchCount = new Map<string, number>();
  for (const [pid, compSet] of compProducts) {
    if (!ownProducts.has(pid)) continue;
    for (const name of compSet) {
      compMatchCount.set(name, (compMatchCount.get(name) || 0) + 1);
    }
  }
  console.log('\n=== MATCHADE MED OSS PER KONKURRENT ===');
  for (const [name, count] of [...compMatchCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + name + ': ' + count);
  }

  const { data: logs } = await sb.from('scraping_logs').select('competitor_id, status, products_scraped, urls_processed, total_urls, created_at')
    .order('created_at', { ascending: false }).limit(20);
  console.log('\n=== SENASTE SCRAPE-LOGGAR ===');
  for (const l of logs || []) {
    const name = compNameMap.get(l.competitor_id) || '?';
    const date = new Date(l.created_at).toLocaleString('sv-SE');
    const urls = l.total_urls ? ` (${l.urls_processed}/${l.total_urls} URLer)` : '';
    console.log(`${date} ${name}: ${l.status} ${l.products_scraped} prod${urls}`);
  }

  const { data: ownProds } = await sb.from('products').select('id, category').eq('is_active', true);
  const catCount: Record<string, { own: number; matched: number }> = {};
  for (const p of ownProds || []) {
    if (!ownProducts.has(p.id)) continue;
    if (!catCount[p.category]) catCount[p.category] = { own: 0, matched: 0 };
    catCount[p.category].own++;
    if (compProducts.has(p.id)) catCount[p.category].matched++;
  }
  console.log('\n=== EGNA PRODUKTER PER KATEGORI ===');
  for (const [cat, c] of Object.entries(catCount).sort((a, b) => b[1].own - a[1].own)) {
    const pct = c.own > 0 ? Math.round(c.matched / c.own * 100) : 0;
    console.log(`  ${cat}: ${c.own} egna, ${c.matched} matchade (${pct}%)`);
  }
}

main().catch(console.error);
