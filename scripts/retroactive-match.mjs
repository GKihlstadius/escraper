import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Helpers from parser.ts (replicated for ESM script) ──

const KNOWN_BRANDS = [
  'bugaboo', 'cybex', 'thule', 'britax', 'stokke', 'joolz',
  'nuna', 'uppababy', 'maxi-cosi', 'joie', 'babyzen',
  'emmaljunga', 'elodie', 'silver cross', 'cam', 'peg perego',
  'hauck', 'chicco', 'besafe', 'axkid', 'recaro',
];

const MODEL_STRIP_WORDS = new Set([
  'inkl', 'inkl.', 'inklusive', 'med', 'plus',
  'onesize', 'one-size', '2024', '2025', '2023', '2022', '2026',
  'essential', 'authentic', 'fresh', 'twillic', 'cab',
  'bilbarnstol', 'bilstol', 'bälteskudde', 'bältesstol',
  'barnvagn', 'duovagn', 'sittvagn', 'syskonvagn', 'joggingvagn',
  'liggvagn', 'sulky', 'buggy', 'kombivagn', 'barnvagnspaket',
  'vagnspaket', 'paket', 'komplett', 'set',
  'babyskydd', 'i-size', 'r129', 'r44',
  'och', 'för', 'till', 'med', 'av', 'den', 'det', 'nya',
  'stroller', 'pushchair', 'pram', 'car', 'seat',
]);

const COLOR_WORDS = new Set([
  'black', 'svart', 'midnight', 'deep', 'matte',
  'white', 'vit', 'off', 'pure',
  'grey', 'gray', 'grå', 'dark', 'light', 'melange',
  'navy', 'marinblå', 'mörkblå',
  'blue', 'blå', 'sky', 'steel', 'stormy',
  'red', 'röd', 'cherry', 'burgundy',
  'green', 'grön', 'forest', 'olive', 'pine', 'sage',
  'beige', 'sand', 'taupe', 'khaki', 'dune', 'desert',
  'brown', 'brun', 'cognac', 'espresso', 'chocolate',
  'pink', 'rosa', 'rose', 'blush', 'misty',
  'yellow', 'gul', 'lemon', 'mustard',
  'purple', 'lila', 'lavender',
  'orange', 'coral', 'peach',
  'silver', 'graphite', 'cream', 'ivory', 'pearl',
  'truffle', 'fog', 'stone', 'charcoal', 'moon', 'glacier',
  'shadow', 'thunder', 'harbor', 'autumn', 'sunset',
]);

function detectBrand(name) {
  const lower = name.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) {
      return brand.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return 'Okänt';
}

function extractModelKey(name, brand) {
  let text = name.toLowerCase();
  // Remove punctuation except hyphens
  text = text.replace(/[^\w\såäöé-]/g, ' ').replace(/\s+/g, ' ').trim();
  let words = text.split(/\s+/);

  // Remove noise + color + strip words
  words = words.filter(w =>
    w.length > 1 &&
    !MODEL_STRIP_WORDS.has(w) &&
    !COLOR_WORDS.has(w) &&
    !/^\d{1,2}$/.test(w)
  );

  const detectedBrand = (brand || detectBrand(name)).toLowerCase().replace(/\s+/g, '-');
  const brandWords = detectedBrand.split('-');
  words = words.filter(w => !brandWords.includes(w));

  const modelWords = words.filter(w => w.length >= 2).slice(0, 3);
  return [detectedBrand, ...modelWords].join(' ').trim();
}

function tokenize(key) {
  return key.split(/\s+/).filter(w => w.length >= 2);
}

function tokenOverlapScore(a, b) {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) {
    if (tokB.has(t)) overlap++;
  }
  return overlap / Math.min(tokA.size, tokB.size);
}

// ── Main ──

console.log('Loading all products...');
const { data: products } = await sb.from('products').select('id, name, brand, normalized_name, is_active');
console.log(`Total products: ${products.length}`);

// Build model keys for all products
const productKeys = products.map(p => ({
  ...p,
  modelKey: extractModelKey(p.name, p.brand),
}));

// Group by brand
const byBrand = new Map();
for (const p of productKeys) {
  const brand = (p.brand || 'Okänt').toLowerCase();
  if (!byBrand.has(brand)) byBrand.set(brand, []);
  byBrand.get(brand).push(p);
}

// Find duplicates: products with same brand and high token overlap
const mergeGroups = []; // Array of [keepId, ...mergeIds]
const merged = new Set();

for (const [brand, items] of byBrand) {
  if (items.length < 2) continue;

  for (let i = 0; i < items.length; i++) {
    if (merged.has(items[i].id)) continue;
    const group = [items[i]];

    for (let j = i + 1; j < items.length; j++) {
      if (merged.has(items[j].id)) continue;
      const score = tokenOverlapScore(items[i].modelKey, items[j].modelKey);
      if (score >= 0.7) {
        group.push(items[j]);
        merged.add(items[j].id);
      }
    }

    if (group.length > 1) {
      merged.add(items[i].id);
      mergeGroups.push(group);
    }
  }
}

console.log(`\nFound ${mergeGroups.length} duplicate groups to merge:\n`);

// For each group, keep the one with the most variants/prices and merge others into it
let totalMerged = 0;
for (const group of mergeGroups) {
  // Count variants for each product
  const variantCounts = await Promise.all(
    group.map(async p => {
      const { count } = await sb.from('product_variants').select('id', { count: 'exact', head: true }).eq('product_id', p.id);
      return { ...p, variantCount: count || 0 };
    })
  );

  // Sort: most variants first, then by name length (shorter = cleaner)
  variantCounts.sort((a, b) => b.variantCount - a.variantCount || a.name.length - b.name.length);

  const keep = variantCounts[0];
  const toMerge = variantCounts.slice(1);

  console.log(`  KEEP: "${keep.name}" (${keep.variantCount} variants)`);
  for (const m of toMerge) {
    console.log(`    MERGE: "${m.name}" (${m.variantCount} variants) → into above`);
  }

  for (const m of toMerge) {
    // Move all variants from m to keep
    const { data: variants } = await sb.from('product_variants').select('id').eq('product_id', m.id);
    if (variants && variants.length > 0) {
      await sb.from('product_variants').update({ product_id: keep.id }).eq('product_id', m.id);
    }

    // Move alerts
    await sb.from('alerts').update({ product_id: keep.id }).eq('product_id', m.id);

    // Move recommendations
    await sb.from('price_recommendations').update({ product_id: keep.id }).eq('product_id', m.id);

    // Deactivate the duplicate
    await sb.from('products').update({ is_active: false }).eq('id', m.id);

    totalMerged++;
  }
  console.log('');
}

console.log(`\nMerged ${totalMerged} duplicate products.`);

// Now re-run check-matches stats
console.log('\n--- Updated matching stats ---\n');

const { count: totalActive } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
console.log('Active products:', totalActive);

const { data: variants } = await sb.from('product_variants').select('id, product_id');
const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));

const { data: prices } = await sb.from('product_prices').select('variant_id, competitor_id').order('scraped_at', { ascending: false });
const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
const ownIds = new Set(comps.filter(c => c.is_own_store).map(c => c.id));

const productComps = new Map();
for (const p of prices) {
  const pid = variantToProduct.get(p.variant_id);
  if (!pid) continue;
  if (!productComps.has(pid)) productComps.set(pid, new Set());
  productComps.get(pid).add(p.competitor_id);
}

const compProductCount = new Map();
for (const [pid, compSet] of productComps) {
  for (const cid of compSet) {
    compProductCount.set(cid, (compProductCount.get(cid) || 0) + 1);
  }
}
console.log('Produkter per butik:');
for (const c of comps) {
  console.log(`  ${c.name}: ${compProductCount.get(c.id) || 0}${c.is_own_store ? ' (egen)' : ''}`);
}

let ownOnly = 0, ownWithMatch = 0, ownTotal = 0;
for (const [pid, compSet] of productComps) {
  const hasOwn = [...compSet].some(id => ownIds.has(id));
  if (!hasOwn) continue;
  ownTotal++;
  const hasOther = [...compSet].some(id => !ownIds.has(id));
  if (hasOther) ownWithMatch++;
  else ownOnly++;
}
console.log('\nEgna butiksprodukter:');
console.log(`  Totalt med prisdata: ${ownTotal}`);
console.log(`  Med matchning hos konkurrent: ${ownWithMatch}`);
console.log(`  Utan matchning: ${ownOnly}`);
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
