import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Same helpers as before
const KNOWN_BRANDS = [
  'bugaboo', 'cybex', 'thule', 'britax', 'stokke', 'joolz',
  'nuna', 'uppababy', 'maxi-cosi', 'joie', 'babyzen',
  'emmaljunga', 'elodie', 'silver cross', 'cam', 'peg perego',
  'hauck', 'chicco', 'besafe', 'axkid', 'recaro',
];

const STRIP = new Set([
  'inkl', 'inklusive', 'med', 'plus', 'pro',
  'onesize', 'one-size', '2024', '2025', '2023', '2022', '2026',
  'essential', 'authentic', 'fresh', 'twillic', 'cab',
  'bilbarnstol', 'bilstol', 'bälteskudde', 'bältesstol',
  'barnvagn', 'duovagn', 'sittvagn', 'syskonvagn', 'joggingvagn',
  'liggvagn', 'sulky', 'buggy', 'kombivagn', 'barnvagnspaket',
  'vagnspaket', 'paket', 'komplett', 'set',
  'babyskydd', 'i-size', 'r129', 'r44',
  'och', 'för', 'till', 'av', 'den', 'det', 'nya',
]);

const COLORS = new Set([
  'black', 'svart', 'midnight', 'deep', 'matte', 'white', 'vit', 'off', 'pure',
  'grey', 'gray', 'grå', 'dark', 'light', 'melange', 'navy', 'marinblå', 'mörkblå',
  'blue', 'blå', 'sky', 'steel', 'stormy', 'red', 'röd', 'cherry', 'burgundy',
  'green', 'grön', 'forest', 'olive', 'pine', 'sage', 'beige', 'sand', 'taupe',
  'khaki', 'dune', 'desert', 'brown', 'brun', 'cognac', 'espresso', 'chocolate',
  'pink', 'rosa', 'rose', 'blush', 'misty', 'yellow', 'gul', 'lemon', 'mustard',
  'purple', 'lila', 'lavender', 'orange', 'coral', 'peach', 'silver', 'graphite',
  'cream', 'ivory', 'pearl', 'truffle', 'fog', 'stone', 'charcoal', 'moon',
  'glacier', 'shadow', 'thunder', 'harbor', 'autumn', 'sunset', 'frost', 'space',
  'cosmos', 'sepia', 'mirage', 'moss', 'almond', 'leaf', 'cozy', 'sandy',
  'dusty', 'carbon', 'soft', 'polar', 'nordic', 'bloom', 'coastal', 'storm',
  'arctic', 'mist', 'tar', 'mineral', 'washed',
]);

function extractModelWords(name) {
  let text = name.toLowerCase().replace(/[^\w\såäöé-]/g, ' ').replace(/\s+/g, ' ').trim();
  let words = text.split(/\s+/).filter(w =>
    w.length > 1 && !STRIP.has(w) && !COLORS.has(w) && !/^\d{1,2}$/.test(w)
  );
  // Remove brand words
  const brandLower = detectBrand(name).toLowerCase().replace(/\s+/g, '-').split('-');
  words = words.filter(w => !brandLower.includes(w));
  return words.filter(w => w.length >= 2).slice(0, 4);
}

function detectBrand(name) {
  const lower = name.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) return brand;
  }
  return 'okänt';
}

function modelScore(wordsA, wordsB) {
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  // Check if model name core (first 1-2 words) matches
  const coreA = wordsA.slice(0, 2).join(' ');
  const coreB = wordsB.slice(0, 2).join(' ');
  if (coreA === coreB) return 1.0;

  // Check first word match (model family)
  if (wordsA[0] === wordsB[0]) {
    // Same model family, check if version/submodel matches
    if (wordsA.length > 1 && wordsB.length > 1 && wordsA[1] !== wordsB[1]) {
      return 0.3; // Same family but different submodel (e.g., Fox 3 vs Fox 5)
    }
    return 0.8;
  }
  return 0;
}

// Fetch all data
async function fetchAll(table, select) {
  const all = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from(table).select(select).range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

const prices = await fetchAll('product_prices', 'variant_id, competitor_id');
const variants = await fetchAll('product_variants', 'id, product_id');
const products = await fetchAll('products', 'id, name, brand, is_active');
const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);

const vToP = new Map(variants.map(v => [v.id, v.product_id]));
const ownIds = new Set(comps.filter(c => c.is_own_store).map(c => c.id));
const productMap = new Map(products.map(p => [p.id, p]));

// Build product -> competitor set
const productComps = new Map();
for (const p of prices) {
  const pid = vToP.get(p.variant_id);
  if (!pid) continue;
  if (!productComps.has(pid)) productComps.set(pid, new Set());
  productComps.get(pid).add(p.competitor_id);
}

// Find own-store products that have NO competitor match
const unmatchedOwn = [];
for (const [pid, compSet] of productComps) {
  const hasOwn = [...compSet].some(id => ownIds.has(id));
  if (!hasOwn) continue;
  const hasOther = [...compSet].some(id => !ownIds.has(id));
  if (!hasOther) {
    const prod = productMap.get(pid);
    if (prod) unmatchedOwn.push(prod);
  }
}

// Find competitor products (not from own stores)
const competitorProducts = [];
for (const [pid, compSet] of productComps) {
  const hasOwnOnly = [...compSet].every(id => ownIds.has(id));
  if (hasOwnOnly) continue; // Skip own-only products
  const prod = productMap.get(pid);
  if (prod) competitorProducts.push(prod);
}

console.log(`Unmatched own products: ${unmatchedOwn.length}`);
console.log(`Competitor products to match against: ${competitorProducts.length}\n`);

// Try to match each unmatched own-store product to a competitor product
let mergeCount = 0;
for (const own of unmatchedOwn) {
  const ownBrand = detectBrand(own.name);
  const ownWords = extractModelWords(own.name);
  if (ownWords.length === 0) continue;

  // Filter candidates by brand
  const candidates = competitorProducts.filter(c => detectBrand(c.name) === ownBrand);

  let bestMatch = null;
  let bestScore = 0;
  for (const cand of candidates) {
    const candWords = extractModelWords(cand.name);
    const score = modelScore(ownWords, candWords);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = cand;
    }
  }

  if (bestMatch && bestScore >= 0.8) {
    console.log(`MERGE: "${own.name}" → "${bestMatch.name}" (score: ${bestScore})`);

    // Move variants from own product to matched competitor product
    await sb.from('product_variants').update({ product_id: bestMatch.id }).eq('product_id', own.id);
    await sb.from('alerts').update({ product_id: bestMatch.id }).eq('product_id', own.id);
    await sb.from('price_recommendations').update({ product_id: bestMatch.id }).eq('product_id', own.id);
    await sb.from('products').update({ is_active: false }).eq('id', own.id);
    mergeCount++;
  } else if (bestMatch && bestScore >= 0.3) {
    console.log(`SKIP (low score ${bestScore}): "${own.name}" ~ "${bestMatch.name}"`);
  }
}

console.log(`\nMerged ${mergeCount} products.`);
