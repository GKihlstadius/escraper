import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get own stores
const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
const ownIds = new Set(comps.filter(c => c.is_own_store).map(c => c.id));

// Get all variants with their product info
const { data: variants } = await sb.from('product_variants').select('id, product_id, variant_name, color');
const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));

// Get all prices
const { data: prices } = await sb.from('product_prices').select('variant_id, competitor_id, url').order('scraped_at', { ascending: false });

// Get all active products
const { data: products } = await sb.from('products').select('id, name, brand, normalized_name').eq('is_active', true);
const productMap = new Map(products.map(p => [p.id, p]));

// Build: product -> set of competitor IDs
const productComps = new Map();
const productUrls = new Map(); // product_id -> competitor_id -> url
for (const p of prices) {
  const pid = variantToProduct.get(p.variant_id);
  if (!pid) continue;
  if (!productComps.has(pid)) productComps.set(pid, new Set());
  productComps.get(pid).add(p.competitor_id);

  const key = `${pid}:${p.competitor_id}`;
  if (!productUrls.has(key) && p.url) productUrls.set(key, p.url);
}

// Find own-store products that have NO competitor match
console.log('=== EGNA PRODUKTER UTAN MATCHNING ===\n');

const unmatched = [];
for (const [pid, compSet] of productComps) {
  const hasOwn = [...compSet].some(id => ownIds.has(id));
  if (!hasOwn) continue;
  const hasOther = [...compSet].some(id => !ownIds.has(id));
  if (hasOther) continue;

  const product = productMap.get(pid);
  if (!product) continue;

  const stores = [...compSet].map(cid => comps.find(c => c.id === cid)?.name).join(', ');
  const url = productUrls.get(`${pid}:${[...compSet][0]}`);

  unmatched.push({ ...product, stores, url });
}

for (const p of unmatched) {
  console.log(`  [${p.brand}] ${p.name}`);
  console.log(`    Butik: ${p.stores}`);
  console.log(`    URL: ${p.url || 'N/A'}`);
  console.log('');
}

console.log(`Total unmatched own-store products: ${unmatched.length}\n`);

// Now show ALL products grouped by brand to see potential matches
console.log('=== ALLA PRODUKTER PER VARUMÄRKE (för unmatched brands) ===\n');

const unmatchedBrands = new Set(unmatched.map(p => p.brand));
for (const brand of unmatchedBrands) {
  const brandProducts = products.filter(p => p.brand === brand);
  console.log(`--- ${brand} (${brandProducts.length} produkter) ---`);
  for (const p of brandProducts) {
    const compSet = productComps.get(p.id);
    const storeNames = compSet ? [...compSet].map(cid => {
      const comp = comps.find(c => c.id === cid);
      return comp ? (comp.is_own_store ? `*${comp.name}*` : comp.name) : '?';
    }).join(', ') : 'ingen prisdata';
    console.log(`  "${p.name}" → ${storeNames}`);
  }
  console.log('');
}
