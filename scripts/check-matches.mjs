import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { count: totalProducts } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
console.log('Totalt produkter:', totalProducts);

const { data: variants } = await sb.from('product_variants').select('id, product_id');
const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));

const { data: prices } = await sb.from('product_prices').select('variant_id, competitor_id').order('scraped_at', { ascending: false });

const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
const ownIds = new Set(comps.filter(c => c.is_own_store).map(c => c.id));

// Group: product -> set of competitor IDs
const productComps = new Map();
for (const p of prices) {
  const pid = variantToProduct.get(p.variant_id);
  if (!pid) continue;
  if (!productComps.has(pid)) productComps.set(pid, new Set());
  productComps.get(pid).add(p.competitor_id);
}

// Count products per competitor
const compProductCount = new Map();
for (const [pid, compSet] of productComps) {
  for (const cid of compSet) {
    compProductCount.set(cid, (compProductCount.get(cid) || 0) + 1);
  }
}
console.log('\nProdukter per butik:');
for (const c of comps) {
  console.log(`  ${c.name}: ${compProductCount.get(c.id) || 0}${c.is_own_store ? ' (egen)' : ''}`);
}

// Products from own stores
let ownOnly = 0, ownWithMatch = 0, ownTotal = 0;
for (const [pid, compSet] of productComps) {
  const hasOwn = [...compSet].some(id => ownIds.has(id));
  if (!hasOwn) continue;
  ownTotal++;
  const hasOther = [...compSet].some(id => !ownIds.has(id));
  if (hasOther) ownWithMatch++;
  else ownOnly++;
}
console.log('\nEgna butiksprodukter (KöpBarnvagn + Bonti):');
console.log(`  Totalt med prisdata: ${ownTotal}`);
console.log(`  Med matchning hos konkurrent: ${ownWithMatch}`);
console.log(`  Utan matchning (bara egen butik): ${ownOnly}`);
console.log(`  Matchningsgrad: ${ownTotal > 0 ? Math.round((ownWithMatch / ownTotal) * 100) : 0}%`);

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
