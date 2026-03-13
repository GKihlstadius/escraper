import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prices } = await sb.from('product_prices').select('variant_id, competitor_id');
const { data: variants } = await sb.from('product_variants').select('id, product_id');
const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);

const vToP = new Map(variants.map(v => [v.id, v.product_id]));
const compProducts = new Map();
for (const p of prices) {
  const pid = vToP.get(p.variant_id);
  if (!pid) continue;
  if (!compProducts.has(p.competitor_id)) compProducts.set(p.competitor_id, new Set());
  compProducts.get(p.competitor_id).add(pid);
}

console.log('Products with price data per competitor:');
for (const c of comps) {
  const count = compProducts.get(c.id)?.size || 0;
  console.log(`  ${c.name}: ${count}${c.is_own_store ? ' (egen)' : ''}`);
}

const { count: active } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
const { count: total } = await sb.from('products').select('id', { count: 'exact', head: true });
console.log(`\nTotal products: ${total}, Active: ${active}`);
console.log(`Total variants: ${variants.length}`);
console.log(`Total price records: ${prices.length}`);

// Check the overlap: how many KBV products also have data from other stores
const ownIds = new Set(comps.filter(c => c.is_own_store).map(c => c.id));
const allComps = new Set(comps.map(c => c.id));

let matched = 0, unmatched = 0;
const ownProducts = new Set();
for (const [compId, prodSet] of compProducts) {
  if (!ownIds.has(compId)) continue;
  for (const pid of prodSet) ownProducts.add(pid);
}

for (const pid of ownProducts) {
  const hasCompetitor = [...compProducts.entries()].some(
    ([cid, pSet]) => !ownIds.has(cid) && pSet.has(pid)
  );
  if (hasCompetitor) matched++;
  else unmatched++;
}

console.log(`\nOwn store products: ${ownProducts.size}`);
console.log(`  Matched with competitor: ${matched}`);
console.log(`  Unmatched: ${unmatched}`);
console.log(`  Match rate: ${ownProducts.size > 0 ? Math.round(matched / ownProducts.size * 100) : 0}%`);
