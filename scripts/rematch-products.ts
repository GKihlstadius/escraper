/**
 * Re-match orphaned products across stores.
 *
 * Phase 1: Fix brands (unknown → detected, normalize aliases)
 * Phase 2: Merge same-model products across stores (own + competitor)
 * Phase 3: Merge same-model-different-color products into variants
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Normalization ---

const COLOR_WORDS = new Set([
  'black', 'white', 'grey', 'gray', 'navy', 'blue', 'red', 'green', 'beige',
  'brown', 'pink', 'yellow', 'purple', 'orange', 'silver', 'cream', 'ivory',
  'pearl', 'graphite', 'coral', 'peach', 'lavender', 'rose', 'blush',
  'midnight', 'dark', 'light', 'deep', 'matte', 'matt', 'pure', 'off',
  'sky', 'steel', 'stormy', 'forest', 'pine', 'sage', 'olive', 'misty',
  'cognac', 'espresso', 'chocolate', 'mustard', 'lemon', 'dune', 'desert',
  'sand', 'taupe', 'khaki', 'burgundy', 'cherry',
  'svart', 'vit', 'grå', 'blå', 'röd', 'grön', 'brun', 'rosa', 'gul', 'lila',
  'marinblå', 'mörkblå',
  'sepia', 'mirage', 'moon', 'fern', 'cocoa', 'cedar', 'hazel', 'truffle',
  'twillic', 'sandy', 'space', 'dusty', 'ocean', 'arctic', 'mineral',
  'platinum', 'leaf', 'cozy', 'nautical', 'magic', 'eclipse', 'thunder',
  'rosegold', 'stone', 'onyx', 'almond', 'glacier', 'storm', 'fossil',
  'everett', 'alaska', 'autumn', 'heritage', 'elegance', 'cosmos',
  'cementgrå', 'khakigrön', 'vanilla', 'brilliant', 'teak', 'harbor',
  'carbon', 'night', 'warm', 'caramel', 'soft', 'breeze', 'fog',
  'candy', 'canvas', 'sapphire', 'henley', 'expedition', 'orkney',
  'caviar', 'moonlight', 'classic', 'mystic', 'mocha', 'latte', 'coffee',
  'granite', 'nordic', 'bloom', 'driftwood', 'coastal', 'costal',
  'beachgrass', 'mist', 'nitro', 'tinted', 'sahara', 'mint',
  'chalk', 'mercury', 'cobalt', 'dusk', 'dawn', 'meadow',
  'essential', 'authentic', 'basic', 'fresh', 'cab', 'pure',
  'melange', 'mélange', 'mesh',
]);

const NOISE_WORDS = new Set([
  'inkl', 'inkl.', 'inklusive', 'med', 'plus', 'och', 'för', 'till', 'av',
  'den', 'det', 'nya', 'onesize', 'one-size',
  '2022', '2023', '2024', '2025', '2026',
  'bilbarnstol', 'bilstol', 'bälteskudde', 'bältesstol',
  'barnvagn', 'duovagn', 'sittvagn', 'syskonvagn', 'joggingvagn',
  'liggvagn', 'sulky', 'buggy', 'kombivagn', 'barnvagnspaket',
  'vagnspaket', 'paket', 'komplett', 'set', 'resevagn',
  'liggdel', 'sittdel', 'sittbas', 'chassi', 'chassis',
  'babyskydd', 'i-size', 'r129', 'r44', 'isofix',
  'stroller', 'pushchair', 'pram', 'car', 'seat',
  'outdoor', 'air', 'ergo', 'flat', 'chrome', 'kg', '0-13',
  'style', 'lux', 'pro',
]);

const BRAND_ALIASES: Record<string, string[]> = {
  'britax': ['britax', 'britax römer', 'britax romer', 'römer'],
  'maxi-cosi': ['maxi-cosi', 'maxicosi', 'maxi cosi'],
  'stokke': ['stokke', 'stokke®'],
  'elodie': ['elodie', 'elodie details'],
  'cybex': ['cybex'],
  'bugaboo': ['bugaboo'],
  'joie': ['joie'],
  'axkid': ['axkid'],
  'besafe': ['besafe', 'be safe'],
  'nuna': ['nuna'],
  'thule': ['thule'],
  'joolz': ['joolz'],
  'emmaljunga': ['emmaljunga', 'emmaljunga '],
  'crescent': ['crescent'],
  'beemoo': ['beemoo'],
  'kinderkraft': ['kinderkraft'],
  'silver cross': ['silver cross', 'silvercross'],
  'baby jogger': ['baby jogger', 'babyjogger'],
  'uppababy': ['uppababy', 'uppa baby'],
  'bebeconfort': ['bebeconfort', 'bébé confort', 'bebe confort'],
  'lionelo': ['lionelo'],
  'hauck': ['hauck'],
  'doona': ['doona'],
  'babyzen': ['babyzen'],
  'peg perego': ['peg perego', 'pegperego'],
  'chicco': ['chicco'],
  'inglesina': ['inglesina'],
  'mutsy': ['mutsy'],
  'mima': ['mima'],
  'icandy': ['icandy', 'i-candy'],
  'bumprider': ['bumprider'],
  'ergobaby': ['ergobaby'],
  'diono': ['diono'],
  'recaro': ['recaro'],
  'cam': ['cam'],
  'abc design': ['abc design'],
  'done by deer': ['done by deer'],
};

const KNOWN_BRANDS = [
  'bugaboo', 'cybex', 'thule', 'britax', 'stokke', 'joolz',
  'nuna', 'uppababy', 'maxi-cosi', 'joie', 'babyzen',
  'emmaljunga', 'elodie', 'silver cross', 'cam', 'peg perego',
  'hauck', 'chicco', 'besafe', 'axkid', 'recaro',
  'crescent', 'beemoo', 'kinderkraft', 'lionelo', 'doona',
  'baby jogger', 'inglesina', 'mutsy', 'mima', 'icandy',
  'bumprider', 'ergobaby', 'diono', 'kunert', 'anex',
  'done by deer', 'abc design',
];

function normalizeBrand(brand: string): string {
  const lower = brand.toLowerCase().replace(/[®™]+/g, '').trim();
  for (const [family, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      if (lower === alias || lower.includes(alias) || alias.includes(lower)) {
        return family;
      }
    }
  }
  return lower.replace(/[\s-]+/g, '');
}

function detectBrand(name: string): string | null {
  const lower = name.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) {
      return brand.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return null;
}

function extractModelKey(name: string, brand: string): string {
  let text = name.toLowerCase();
  text = text.replace(/\([^)]*\)/g, '');
  text = text.replace(/[^\w\såäöé-]/g, ' ').replace(/\s+/g, ' ').trim();

  const words = text.split(/\s+/);
  const brandNorm = normalizeBrand(brand);
  const brandWords = new Set(brandNorm.split(/[\s-]+/));

  // Single letters that are significant model identifiers (e.g., Cloud T, Sirona G, Doona X)
  const MODEL_LETTERS = new Set(['t', 'g', 'x', 'i', 's', 'z', 'r', 'm', 'e']);

  const significant = words.filter(w => {
    if (w.length <= 0) return false;
    if (w.length === 1 && !MODEL_LETTERS.has(w)) return false;
    if (brandWords.has(w)) return false;
    if (COLOR_WORDS.has(w)) return false;
    if (NOISE_WORDS.has(w)) return false;
    if (/^\d{1,2}$/.test(w)) return false;
    return true;
  });

  return significant.join(' ').trim();
}

const ACCESSORY_KEYWORDS = [
  'liggdel', 'sittdel', 'sittbas', 'chassi', 'chassis', 'adapter',
  'regnskydd', 'sufflett', 'mugghållare', 'fotsack', 'insektsnät',
  'solskydd', 'körkåpa', 'handtag', 'hjul', 'madrass', 'parasoll',
  'transportväska', 'resväska', 'skötväska', 'cupholder', 'footmuff',
  'raincover', 'syskonsits', 'extrasits', 'snack tray', 'barsele',
  'cabin bag', 'travel bag', 'resebag', 'bilstolsbas', 'vindskydd',
  'bas till', 'base t', 'base m', 'base z', 'i-base', 'basefix',
  'familyfix', 'solsuflett', 'sommaröverdrag', 'överdrag',
  'barnvagnsleksak', 'barnvagnshänge', 'barnvagnsringar', 'organiser',
  'organizer', 'babynest', 'nattlampa', 'baby monitor', 'babysitter',
  'training tower', 'balanscykel', 'trehjuling', 'krokar',
  'barnvagnsgardin',
];

const BUNDLE_KEYWORDS = ['paket', 'komplett', 'bundle', 'barnvagnspaket', 'vagnspaket', 'kombivagn', 'travelsystem', 'trio'];

function getProductType(name: string): 'accessory' | 'bundle' | 'product' {
  const lower = name.toLowerCase();
  if (ACCESSORY_KEYWORDS.some(k => lower.includes(k))) return 'accessory';
  if (BUNDLE_KEYWORDS.some(k => lower.includes(k))) return 'bundle';
  return 'product';
}

// Types
interface Product {
  id: string;
  name: string;
  brand: string;
  is_active: boolean;
  normalized_name: string;
}
interface Variant { id: string; product_id: string; color: string | null; variant_name: string; image: string | null; }
interface Price { id: string; variant_id: string; competitor_id: string; price: number; }
interface Competitor { id: string; name: string; is_own_store: boolean; }

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(offset, offset + 999);
    if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Loading data...');
  const products = await fetchAll<Product>('products', 'id, name, brand, is_active, normalized_name');
  const variants = await fetchAll<Variant>('product_variants', 'id, product_id, color, variant_name, image');
  const prices = await fetchAll<Price>('product_prices', 'id, variant_id, competitor_id, price');
  const competitors = await fetchAll<Competitor>('competitors', 'id, name, is_own_store');

  const compMap = Object.fromEntries(competitors.map(c => [c.id, c]));
  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));

  console.log(`Loaded: ${products.length} products, ${variants.length} variants, ${prices.length} prices\n`);

  // Build indexes
  const variantsByProduct = new Map<string, Variant[]>();
  for (const v of variants) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id)!.push(v);
  }

  const pricesByVariant = new Map<string, Price[]>();
  for (const p of prices) {
    if (!pricesByVariant.has(p.variant_id)) pricesByVariant.set(p.variant_id, []);
    pricesByVariant.get(p.variant_id)!.push(p);
  }

  const productCompetitors = new Map<string, Set<string>>();
  for (const v of variants) {
    for (const p of pricesByVariant.get(v.id) || []) {
      if (!productCompetitors.has(v.product_id)) productCompetitors.set(v.product_id, new Set());
      productCompetitors.get(v.product_id)!.add(p.competitor_id);
    }
  }

  // ===== PHASE 1: FIX BRANDS =====
  console.log('═══ PHASE 1: FIX BRANDS ═══\n');

  let brandsFixed = 0;
  for (const p of products) {
    if (p.brand && p.brand !== 'Okänt') {
      // Normalize existing brand
      const normalized = normalizeBrand(p.brand);
      const canonical = Object.entries(BRAND_ALIASES).find(([, aliases]) =>
        aliases.includes(normalized)
      )?.[0];

      if (canonical) {
        const properName = canonical.split(/[\s-]+/).map(w => w[0].toUpperCase() + w.slice(1)).join(canonical.includes('-') ? '-' : ' ');
        if (p.brand !== properName && p.brand.toLowerCase() !== canonical) {
          // Only fix major mismatches (e.g., "Britax Römer" stays, but "Stokke®" → "Stokke")
          if (p.brand.replace(/[®™]/g, '').trim().toLowerCase() !== properName.toLowerCase()) {
            continue; // Keep as-is for minor variations
          }
          console.log(`  FIX: "${p.brand}" → "${properName}" (${p.name})`);
          if (!dryRun) {
            await supabase.from('products').update({ brand: properName }).eq('id', p.id);
          }
          p.brand = properName;
          brandsFixed++;
        }
      }
      continue;
    }

    // Try to detect brand from product name
    const detected = detectBrand(p.name);
    if (detected) {
      console.log(`  DETECT: "${p.name}" → brand: ${detected}`);
      if (!dryRun) {
        await supabase.from('products').update({ brand: detected }).eq('id', p.id);
      }
      p.brand = detected;
      brandsFixed++;
    }
  }
  console.log(`\nBrands fixed: ${brandsFixed}\n`);

  // ===== PHASE 2: MERGE CROSS-STORE DUPLICATES =====
  console.log('═══ PHASE 2: MERGE CROSS-STORE DUPLICATES ═══\n');

  // Re-group with fixed brands
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    if (!p.brand || !p.name) continue;
    if (!productCompetitors.has(p.id)) continue;

    const brand = normalizeBrand(p.brand);
    const model = extractModelKey(p.name, p.brand);
    if (!model || model.length < 2) continue;

    const type = getProductType(p.name);
    const key = `${brand}|${model}|${type}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const getAvgPrice = (p: Product): number => {
    const vars = variantsByProduct.get(p.id) || [];
    const allPrices = vars.flatMap(v => (pricesByVariant.get(v.id) || []).map(pp => pp.price));
    if (allPrices.length === 0) return 0;
    return allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
  };

  const getPriceCount = (p: Product): number => {
    const vars = variantsByProduct.get(p.id) || [];
    return vars.reduce((sum, v) => sum + (pricesByVariant.get(v.id)?.length || 0), 0);
  };

  let mergeCount = 0;
  let pricesMoved = 0;
  let deactivated = 0;

  for (const [key, groupProducts] of groups) {
    if (groupProducts.length < 2) continue;

    const hasOwn: Product[] = [];
    const compOnly: Product[] = [];

    for (const p of groupProducts) {
      const comps = productCompetitors.get(p.id) || new Set();
      if ([...comps].some(c => ownStoreIds.has(c))) {
        hasOwn.push(p);
      } else {
        compOnly.push(p);
      }
    }

    if (hasOwn.length === 0 || compOnly.length === 0) continue;

    const canonical = hasOwn.sort((a, b) => getPriceCount(b) - getPriceCount(a))[0];
    const canonicalAvg = getAvgPrice(canonical);

    for (const dup of compOnly) {
      const dupAvg = getAvgPrice(dup);
      if (canonicalAvg > 0 && dupAvg > 0) {
        const ratio = dupAvg / canonicalAvg;
        if (ratio > 2.5 || ratio < 0.3) {
          console.log(`  SKIP price mismatch: "${dup.name}" (avg ${Math.round(dupAvg)}) vs "${canonical.name}" (avg ${Math.round(canonicalAvg)})`);
          continue;
        }
      }

      const dupVars = variantsByProduct.get(dup.id) || [];
      const dupPriceCount = getPriceCount(dup);
      const dupComps = new Set<string>();
      for (const v of dupVars) {
        for (const p of pricesByVariant.get(v.id) || []) {
          dupComps.add(compMap[p.competitor_id]?.name || '?');
        }
      }

      console.log(`  MERGE: "${dup.name}" (${[...dupComps].join(', ')}, ${dupPriceCount} prices) → "${canonical.name}"`);

      if (!dryRun) {
        for (const dupVar of dupVars) {
          const dupPrices = pricesByVariant.get(dupVar.id) || [];
          if (dupPrices.length === 0) continue;

          const canonVars = variantsByProduct.get(canonical.id) || [];
          let targetVar = canonVars.find(v => v.color === dupVar.color);
          if (!targetVar) {
            const { data: newVar } = await supabase
              .from('product_variants')
              .insert({ product_id: canonical.id, color: dupVar.color, variant_name: dupVar.variant_name, image: dupVar.image })
              .select().single();
            if (newVar) {
              targetVar = newVar as Variant;
              if (!variantsByProduct.has(canonical.id)) variantsByProduct.set(canonical.id, []);
              variantsByProduct.get(canonical.id)!.push(targetVar);
            }
          }
          if (!targetVar) continue;

          for (let i = 0; i < dupPrices.length; i += 100) {
            const batch = dupPrices.slice(i, i + 100).map(p => p.id);
            await supabase.from('product_prices').update({ variant_id: targetVar.id }).in('id', batch);
            pricesMoved += batch.length;
          }
        }
        await supabase.from('products').update({ is_active: false }).eq('id', dup.id);
        deactivated++;
      }
      mergeCount++;
    }
  }
  console.log(`\nCross-store merges: ${mergeCount}, prices moved: ${pricesMoved}, deactivated: ${deactivated}\n`);

  // ===== PHASE 3: MERGE COLOR VARIANTS =====
  console.log('═══ PHASE 3: MERGE COLOR VARIANTS ═══\n');

  // Re-group ALL products (since we may have merged some)
  // This time, group products that are the same model but different colors
  // and are already within the SAME store side (both own-store or both competitor)
  const colorGroups = new Map<string, Product[]>();
  for (const p of products) {
    if (!p.brand || !p.name || !p.is_active) continue;
    if (!productCompetitors.has(p.id)) continue;

    const brand = normalizeBrand(p.brand);
    const model = extractModelKey(p.name, p.brand);
    if (!model || model.length < 2) continue;
    const type = getProductType(p.name);
    const key = `${brand}|${model}|${type}`;

    if (!colorGroups.has(key)) colorGroups.set(key, []);
    colorGroups.get(key)!.push(p);
  }

  let colorMerges = 0;
  let colorPricesMoved = 0;

  for (const [key, groupProducts] of colorGroups) {
    if (groupProducts.length < 2) continue;

    // All products in this group should be the same model - merge into one
    // Pick the one with most prices as canonical
    const sorted = groupProducts.sort((a, b) => getPriceCount(b) - getPriceCount(a));
    const canonical = sorted[0];
    const canonicalAvg = getAvgPrice(canonical);

    for (let i = 1; i < sorted.length; i++) {
      const dup = sorted[i];

      // Price sanity check
      const dupAvg = getAvgPrice(dup);
      if (canonicalAvg > 0 && dupAvg > 0) {
        const ratio = dupAvg / canonicalAvg;
        if (ratio > 2.5 || ratio < 0.3) continue;
      }

      const dupVars = variantsByProduct.get(dup.id) || [];
      const dupPriceCount = getPriceCount(dup);
      if (dupPriceCount === 0) continue;

      console.log(`  COLOR MERGE: "${dup.name}" (${dupPriceCount} prices) → "${canonical.name}"`);

      if (!dryRun) {
        for (const dupVar of dupVars) {
          const dupPrices = pricesByVariant.get(dupVar.id) || [];
          if (dupPrices.length === 0) continue;

          const canonVars = variantsByProduct.get(canonical.id) || [];
          let targetVar = canonVars.find(v => v.color === dupVar.color);
          if (!targetVar) {
            const { data: newVar } = await supabase
              .from('product_variants')
              .insert({ product_id: canonical.id, color: dupVar.color, variant_name: dupVar.variant_name, image: dupVar.image })
              .select().single();
            if (newVar) {
              targetVar = newVar as Variant;
              if (!variantsByProduct.has(canonical.id)) variantsByProduct.set(canonical.id, []);
              variantsByProduct.get(canonical.id)!.push(targetVar);
            }
          }
          if (!targetVar) continue;

          for (let i2 = 0; i2 < dupPrices.length; i2 += 100) {
            const batch = dupPrices.slice(i2, i2 + 100).map(p => p.id);
            await supabase.from('product_prices').update({ variant_id: targetVar.id }).in('id', batch);
            colorPricesMoved += batch.length;
          }
        }
        await supabase.from('products').update({ is_active: false }).eq('id', dup.id);
      }
      colorMerges++;
    }
  }
  console.log(`\nColor merges: ${colorMerges}, prices moved: ${colorPricesMoved}\n`);

  // Summary
  console.log('═══════════════════════════════════════');
  console.log(`  TOTAL RESULTS${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('═══════════════════════════════════════');
  console.log(`  Brands fixed: ${brandsFixed}`);
  console.log(`  Cross-store merges: ${mergeCount}`);
  console.log(`  Color variant merges: ${colorMerges}`);
  console.log(`  Total prices moved: ${pricesMoved + colorPricesMoved}`);
  console.log(`  Total deactivated: ${deactivated + colorMerges}`);
  if (dryRun) console.log('\nRun without --dry-run to execute');
}

main().catch(console.error);
