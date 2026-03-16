/**
 * Re-match orphaned products across stores.
 *
 * Problem: Products scraped from own stores and competitors often end up as
 * separate product records because name normalization differs between stores.
 *
 * This script:
 * 1. Finds all products with prices
 * 2. Groups them by brand + model key
 * 3. For products that should be the same, merges them:
 *    - Keeps the own-store product as the canonical one
 *    - Moves competitor prices to the canonical product
 *    - Deactivates the duplicate
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Normalization helpers (mirrors parser.ts but improved) ---

const COLOR_WORDS = new Set([
  // English
  'black', 'white', 'grey', 'gray', 'navy', 'blue', 'red', 'green', 'beige',
  'brown', 'pink', 'yellow', 'purple', 'orange', 'silver', 'cream', 'ivory',
  'pearl', 'graphite', 'coral', 'peach', 'lavender', 'rose', 'blush',
  'midnight', 'dark', 'light', 'deep', 'matte', 'matt', 'pure', 'off',
  'sky', 'steel', 'stormy', 'forest', 'pine', 'sage', 'olive', 'misty',
  'cognac', 'espresso', 'chocolate', 'mustard', 'lemon', 'dune', 'desert',
  'sand', 'taupe', 'khaki', 'burgundy', 'cherry',
  // Swedish
  'svart', 'vit', 'grå', 'blå', 'röd', 'grön', 'brun', 'rosa', 'gul', 'lila',
  'marinblå', 'mörkblå',
  // Product-specific color names (common in baby products)
  'sepia', 'mirage', 'moon', 'fern', 'cocoa', 'cedar', 'hazel', 'truffle',
  'twillic', 'sandy', 'space', 'dusty', 'ocean', 'arctic', 'mineral',
  'platinum', 'leaf', 'cozy', 'nautical', 'magic', 'eclipse', 'thunder',
  'rosegold', 'stone', 'onyx', 'almond', 'glacier', 'storm',
  'everett', 'alaska', 'fossil', 'autumn', 'spring', 'summer', 'winter',
  'heritage', 'classic', 'modern', 'fresh', 'essential', 'authentic',
  'cab', 'elegance', 'cementgrå', 'khakigrön',
]);

const NOISE_WORDS = new Set([
  'inkl', 'inklusive', 'med', 'plus', 'och', 'för', 'till', 'av', 'den', 'det', 'nya',
  'onesize', 'one-size',
  '2022', '2023', '2024', '2025', '2026',
  'bilbarnstol', 'bilstol', 'bälteskudde', 'bältesstol',
  'barnvagn', 'duovagn', 'sittvagn', 'syskonvagn', 'joggingvagn',
  'liggvagn', 'sulky', 'buggy', 'kombivagn', 'barnvagnspaket',
  'vagnspaket', 'paket', 'komplett', 'set',
  'liggdel', 'sittdel', 'sittbas', 'chassi', 'chassis',
  'babyskydd', 'i-size', 'r129', 'r44',
  'stroller', 'pushchair', 'pram', 'car', 'seat',
  'outdoor', 'air', 'ergo', 'flat',
]);

const BRAND_ALIASES: Record<string, string[]> = {
  'britax': ['britax', 'britax römer', 'britax romer'],
  'maxi-cosi': ['maxi-cosi', 'maxicosi', 'maxi cosi'],
  'stokke': ['stokke'],
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
  'cam': ['cam'],
  'chicco': ['chicco'],
  'inglesina': ['inglesina'],
  'mutsy': ['mutsy'],
  'mima': ['mima'],
  'icandy': ['icandy', 'i-candy'],
  'bumprider': ['bumprider'],
  'ergobaby': ['ergobaby'],
  'diono': ['diono'],
  'recaro': ['recaro'],
};

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

function extractModelKey(name: string, brand: string): string {
  let text = name.toLowerCase();

  // Remove everything in parentheses (often colors/frame variants)
  text = text.replace(/\([^)]*\)/g, '');

  // Remove punctuation except hyphens
  text = text.replace(/[^\w\såäöé-]/g, ' ').replace(/\s+/g, ' ').trim();

  const words = text.split(/\s+/);

  // Remove brand words, color words, noise words, and short/numeric tokens
  const brandWords = new Set(normalizeBrand(brand).split(/[\s-]+/));
  const significant = words.filter(w => {
    if (w.length <= 1) return false;
    if (brandWords.has(w)) return false;
    if (COLOR_WORDS.has(w)) return false;
    if (NOISE_WORDS.has(w)) return false;
    if (/^\d{1,2}$/.test(w)) return false;
    return true;
  });

  return significant.join(' ').trim();
}

// Product type detection for compatibility
const ACCESSORY_KEYWORDS = [
  'liggdel', 'sittdel', 'sittbas', 'chassi', 'chassis', 'adapter',
  'regnskydd', 'sufflett', 'mugghållare', 'fotsack', 'insektsnät',
  'solskydd', 'körkåpa', 'handtag', 'hjul', 'madrass', 'parasoll',
  'transportväska', 'resväska', 'skötväska', 'cupholder', 'footmuff',
  'raincover', 'syskonsits', 'extrasits', 'snack tray', 'barsele',
  'cabin bag', 'travel bag', 'resebag', 'bilstolsbas', 'vindskydd',
  'bas till', 'base t', 'base m', 'base z', 'i-base', 'basefix',
  'familyfix', 'isofix', 'solsuflett',
];

const BUNDLE_KEYWORDS = ['paket', 'komplett', 'bundle', 'barnvagnspaket', 'vagnspaket', 'kombivagn'];

function getProductType(name: string): 'accessory' | 'bundle' | 'product' {
  const lower = name.toLowerCase();
  if (ACCESSORY_KEYWORDS.some(k => lower.includes(k))) return 'accessory';
  if (BUNDLE_KEYWORDS.some(k => lower.includes(k))) return 'bundle';
  return 'product';
}

// Main types
interface Product {
  id: string;
  name: string;
  brand: string;
  is_active: boolean;
  normalized_name: string;
}

interface Variant {
  id: string;
  product_id: string;
  color: string | null;
  variant_name: string;
  image: string | null;
}

interface Price {
  id: string;
  variant_id: string;
  competitor_id: string;
  price: number;
}

interface Competitor {
  id: string;
  name: string;
  is_own_store: boolean;
}

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
  console.log('Loading data...');

  const products = await fetchAll<Product>('products', 'id, name, brand, is_active, normalized_name');
  const variants = await fetchAll<Variant>('product_variants', 'id, product_id, color, variant_name, image');
  const prices = await fetchAll<Price>('product_prices', 'id, variant_id, competitor_id, price');
  const competitors = await fetchAll<Competitor>('competitors', 'id, name, is_own_store');

  const compMap = Object.fromEntries(competitors.map(c => [c.id, c]));
  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));

  console.log(`Loaded: ${products.length} products, ${variants.length} variants, ${prices.length} prices`);

  // Build indexes
  const variantsByProduct = new Map<string, Variant[]>();
  const variantMap = new Map<string, Variant>();
  for (const v of variants) {
    variantMap.set(v.id, v);
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id)!.push(v);
  }

  const pricesByVariant = new Map<string, Price[]>();
  for (const p of prices) {
    if (!pricesByVariant.has(p.variant_id)) pricesByVariant.set(p.variant_id, []);
    pricesByVariant.get(p.variant_id)!.push(p);
  }

  // Classify products by which competitors have prices
  const productCompetitors = new Map<string, Set<string>>();
  for (const v of variants) {
    const vPrices = pricesByVariant.get(v.id) || [];
    for (const p of vPrices) {
      if (!productCompetitors.has(v.product_id)) productCompetitors.set(v.product_id, new Set());
      productCompetitors.get(v.product_id)!.add(p.competitor_id);
    }
  }

  // Group ALL products (active and inactive with prices) by normalized brand + model key
  const groups = new Map<string, Product[]>();

  for (const p of products) {
    if (!p.brand || !p.name) continue;
    if (!productCompetitors.has(p.id)) continue; // skip products without any prices

    const brand = normalizeBrand(p.brand);
    const model = extractModelKey(p.name, p.brand);
    if (!model || model.length < 2) continue;

    const type = getProductType(p.name);
    const key = `${brand}|${model}|${type}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // Find groups with multiple products (potential duplicates to merge)
  let mergeCount = 0;
  let pricesMoved = 0;
  let deactivated = 0;
  const merges: Array<{ canonical: Product; duplicate: Product; key: string }> = [];

  for (const [key, groupProducts] of groups) {
    if (groupProducts.length < 2) continue;

    // Separate into own-store and competitor-only products
    const hasOwn: Product[] = [];
    const compOnly: Product[] = [];

    for (const p of groupProducts) {
      const comps = productCompetitors.get(p.id) || new Set();
      const hasOwnPrice = [...comps].some(c => ownStoreIds.has(c));
      if (hasOwnPrice) {
        hasOwn.push(p);
      } else {
        compOnly.push(p);
      }
    }

    if (hasOwn.length === 0 || compOnly.length === 0) continue;

    // Pick canonical: own-store product with most prices
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

    const canonical = hasOwn.sort((a, b) => getPriceCount(b) - getPriceCount(a))[0];
    const canonicalAvg = getAvgPrice(canonical);

    // Merge competitor-only products into canonical
    for (const dup of compOnly) {
      const dupAvg = getAvgPrice(dup);

      // Price sanity check
      if (canonicalAvg > 0 && dupAvg > 0) {
        const ratio = dupAvg / canonicalAvg;
        if (ratio > 2.5 || ratio < 0.3) {
          console.log(`  SKIP price mismatch: "${dup.name}" (avg ${Math.round(dupAvg)}) vs "${canonical.name}" (avg ${Math.round(canonicalAvg)})`);
          continue;
        }
      }

      merges.push({ canonical, duplicate: dup, key });
    }
  }

  console.log(`\nFound ${merges.length} products to merge\n`);

  const dryRun = process.argv.includes('--dry-run');

  for (const merge of merges) {
    const { canonical: canon, duplicate: dup } = merge;
    const dupVars = variantsByProduct.get(dup.id) || [];
    const dupPriceCount = dupVars.reduce((sum, v) => sum + (pricesByVariant.get(v.id)?.length || 0), 0);

    const dupComps = new Set<string>();
    for (const v of dupVars) {
      for (const p of pricesByVariant.get(v.id) || []) {
        dupComps.add(compMap[p.competitor_id]?.name || p.competitor_id);
      }
    }

    console.log(`MERGE: "${dup.name}" (${[...dupComps].join(', ')}, ${dupPriceCount} prices)`);
    console.log(`  INTO: "${canon.name}" (canonical)`);

    if (dryRun) continue;

    // Execute merge
    for (const dupVar of dupVars) {
      const dupPrices = pricesByVariant.get(dupVar.id) || [];
      if (dupPrices.length === 0) continue;

      // Find or create matching variant in canonical product
      const canonVars = variantsByProduct.get(canon.id) || [];
      let targetVar = canonVars.find(v => v.color === dupVar.color);

      if (!targetVar) {
        const { data: newVar } = await supabase
          .from('product_variants')
          .insert({
            product_id: canon.id,
            color: dupVar.color,
            variant_name: dupVar.variant_name,
            image: dupVar.image,
          })
          .select()
          .single();

        if (newVar) {
          targetVar = newVar as Variant;
          if (!variantsByProduct.has(canon.id)) variantsByProduct.set(canon.id, []);
          variantsByProduct.get(canon.id)!.push(targetVar);
        }
      }

      if (!targetVar) continue;

      // Move prices to canonical variant
      const priceIds = dupPrices.map(p => p.id);
      // Process in batches (Supabase has limits on IN clauses)
      for (let i = 0; i < priceIds.length; i += 100) {
        const batch = priceIds.slice(i, i + 100);
        const { error } = await supabase
          .from('product_prices')
          .update({ variant_id: targetVar.id })
          .in('id', batch);

        if (error) {
          console.log(`  ERROR moving prices: ${error.message}`);
        } else {
          pricesMoved += batch.length;
        }
      }
    }

    // Deactivate duplicate
    await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', dup.id);

    deactivated++;
    mergeCount++;
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  RESULTS${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`═══════════════════════════════════════`);
  console.log(`  Products merged: ${mergeCount}`);
  console.log(`  Prices moved: ${pricesMoved}`);
  console.log(`  Duplicates deactivated: ${deactivated}`);

  if (dryRun) {
    console.log(`\nRun without --dry-run to execute merges`);
  }
}

main().catch(console.error);
