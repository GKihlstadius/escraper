import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Fetch ALL price records (paginate to avoid 1000 limit)
async function fetchAll(table, select, filters = {}) {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + pageSize - 1);
    for (const [k, v] of Object.entries(filters)) {
      q = q.eq(k, v);
    }
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const prices = await fetchAll('product_prices', 'variant_id, competitor_id');
const variants = await fetchAll('product_variants', 'id, product_id');
const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
const products = await fetchAll('products', 'id, name, brand, is_active');

console.log(`Total price records: ${prices.length}`);
console.log(`Total variants: ${variants.length}`);
console.log(`Total products: ${products.length} (active: ${products.filter(p => p.is_active).length})`);

const vToP = new Map(variants.map(v => [v.id, v.product_id]));
const compProducts = new Map();
for (const p of prices) {
  const pid = vToP.get(p.variant_id);
  if (!pid) continue;
  if (!compProducts.has(p.competitor_id)) compProducts.set(p.competitor_id, new Set());
  compProducts.get(p.competitor_id).add(pid);
}

console.log('\nProducts with price data per competitor:');
for (const c of comps) {
  const count = compProducts.get(c.id)?.size || 0;
  console.log(`  ${c.name}: ${count}${c.is_own_store ? ' (egen)' : ''}`);
}

const ownIds = new Set(comps.filter(c => c.is_own_store).map(c => c.id));
const productMap = new Map(products.map(p => [p.id, p]));

// Build: product -> set of competitor IDs
const productComps = new Map();
for (const p of prices) {
  const pid = vToP.get(p.variant_id);
  if (!pid) continue;
  if (!productComps.has(pid)) productComps.set(pid, new Set());
  productComps.get(pid).add(p.competitor_id);
}

let matched = 0, unmatched = 0;
const unmatchedProducts = [];
for (const [pid, compSet] of productComps) {
  const hasOwn = [...compSet].some(id => ownIds.has(id));
  if (!hasOwn) continue;
  const hasOther = [...compSet].some(id => !ownIds.has(id));
  if (hasOther) {
    matched++;
  } else {
    unmatched++;
    const prod = productMap.get(pid);
    if (prod) unmatchedProducts.push(prod);
  }
}

const ownTotal = matched + unmatched;
console.log(`\nOwn store products: ${ownTotal}`);
console.log(`  Matched with competitor: ${matched}`);
console.log(`  Unmatched: ${unmatched}`);
console.log(`  Match rate: ${ownTotal > 0 ? Math.round(matched / ownTotal * 100) : 0}%`);

// Show unmatched products grouped by brand
console.log('\n=== UNMATCHED OWN-STORE PRODUCTS ===');
const byBrand = new Map();
for (const p of unmatchedProducts) {
  const brand = p.brand || 'Okänt';
  if (!byBrand.has(brand)) byBrand.set(brand, []);
  byBrand.get(brand).push(p);
}
for (const [brand, items] of [...byBrand.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${brand} (${items.length}):`);
  for (const p of items.slice(0, 10)) {
    console.log(`    - ${p.name}`);
  }
  if (items.length > 10) console.log(`    ... and ${items.length - 10} more`);
}

// Cross-matching stats
let multi2 = 0, multi3 = 0, multi4 = 0;
for (const [, compSet] of productComps) {
  if (compSet.size >= 2) multi2++;
  if (compSet.size >= 3) multi3++;
  if (compSet.size >= 4) multi4++;
}
console.log(`\nJämförbara produkter:`);
console.log(`  2+ butiker: ${multi2}`);
console.log(`  3+ butiker: ${multi3}`);
console.log(`  4+ butiker: ${multi4}`);
