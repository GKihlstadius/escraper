// Re-match: find competitor products that should be linked to our own products
// by using looser brand matching and better name comparison
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const STRIP = new Set(['inkl', 'inklusive', 'med', 'plus', 'onesize', 'one-size', '2024', '2025', '2023', '2022', '2026',
  'essential', 'authentic', 'fresh', 'twillic', 'cab', 'bilbarnstol', 'bilstol', 'bälteskudde', 'bältesstol',
  'barnvagn', 'duovagn', 'sittvagn', 'syskonvagn', 'joggingvagn', 'liggvagn', 'sulky', 'buggy', 'kombivagn',
  'barnvagnspaket', 'vagnspaket', 'paket', 'komplett', 'set', 'babyskydd', 'i-size', 'r129', 'r44',
  'och', 'för', 'till', 'med', 'av', 'den', 'det', 'nya', 'stroller', 'pushchair', 'pram', 'car', 'seat']);

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^\w\såäöé-]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(/\s+/).filter(w => w.length > 1 && !STRIP.has(w)));
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) { if (tokensB.has(t)) overlap++; }
  return overlap / Math.min(tokensA.size, tokensB.size);
}

function normBrand(brand: string): string {
  return brand.toLowerCase().replace(/[\s\-_]+/g, '').replace(/römer/g, '').replace(/details/g, '').trim();
}

// Map of known brand aliases
const BRAND_ALIASES: Record<string, string[]> = {
  'britax': ['britax', 'britaxrömer', 'britax römer', 'britaxromer'],
  'maxi-cosi': ['maxi-cosi', 'maxicosi', 'maxi cosi'],
  'stokke': ['stokke', 'stokke®'],
  'elodie': ['elodie', 'elodie details', 'elodiedetails'],
  'cybex': ['cybex'],
  'bugaboo': ['bugaboo'],
  'joie': ['joie'],
  'axkid': ['axkid'],
  'besafe': ['besafe'],
  'nuna': ['nuna'],
  'thule': ['thule'],
  'joolz': ['joolz'],
  'emmaljunga': ['emmaljunga'],
  'crescent': ['crescent'],
};

function brandFamily(brand: string): string {
  const lower = brand.toLowerCase().replace(/[\s\-_®]+/g, '');
  for (const [family, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      if (lower === alias.replace(/[\s\-_®]+/g, '') || lower.includes(alias.replace(/[\s\-_®]+/g, ''))) {
        return family;
      }
    }
  }
  return lower;
}

async function main() {
  const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
  const ownIds = new Set((comps || []).filter(c => c.is_own_store).map(c => c.id));
  const compMap = new Map((comps || []).map(c => [c.id, c]));

  // Get ALL products (including inactive) to find duplicates
  const { data: allProducts } = await sb.from('products').select('id, name, brand, normalized_name, is_active');
  const { data: variants } = await sb.from('product_variants').select('id, product_id, color');
  const { data: prices } = await sb.from('product_prices').select('id, variant_id, competitor_id, price, scraped_at')
    .order('scraped_at', { ascending: false });

  const varToProduct = new Map((variants || []).map(v => [v.id, v.product_id]));
  const productVariants = new Map<string, typeof variants>();
  for (const v of variants || []) {
    if (!productVariants.has(v.product_id)) productVariants.set(v.product_id, []);
    productVariants.get(v.product_id)!.push(v);
  }

  // Latest price per variant+competitor
  const latestPrice = new Map<string, { price: number; count: number }>();
  for (const p of prices || []) {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (!latestPrice.has(key)) latestPrice.set(key, { price: p.price, count: 0 });
    latestPrice.get(key)!.count++;
  }

  // Classify products
  const ownProds: typeof allProducts = []; // products with own-store prices
  const compProds: typeof allProducts = []; // products with competitor-only prices

  for (const prod of allProducts || []) {
    const vars = productVariants.get(prod.id) || [];
    let hasOwn = false, hasComp = false;
    for (const v of vars) {
      for (const [key] of latestPrice) {
        if (!key.startsWith(v.id + ':')) continue;
        const cid = key.split(':')[1];
        if (ownIds.has(cid)) hasOwn = true;
        else hasComp = true;
      }
    }
    if (hasOwn && !hasComp) ownProds.push(prod);
    if (hasComp && !hasOwn) compProds.push(prod);
  }

  console.log(`Egna utan konkurrent: ${ownProds.length}`);
  console.log(`Konkurrent utan egna: ${compProds.length}`);

  // Try to match competitor products to own products
  let merged = 0;
  const mergedIds = new Set<string>();

  for (const compProd of compProds) {
    const compFamily = brandFamily(compProd.brand);

    // Find own products with same brand family
    const candidates = ownProds.filter(p => brandFamily(p.brand) === compFamily && !mergedIds.has(p.id));
    if (candidates.length === 0) continue;

    let bestMatch: typeof ownProds[0] | null = null;
    let bestScore = 0;

    for (const own of candidates) {
      const score = tokenOverlapScore(own.name, compProd.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = own;
      }
    }

    if (bestMatch && bestScore >= 0.6) {
      console.log(`\nMERGE (score ${bestScore.toFixed(2)}):`);
      console.log(`  Egen: ${bestMatch.brand} — ${bestMatch.name} [${bestMatch.id.slice(0, 8)}]`);
      console.log(`  Konk: ${compProd.brand} — ${compProd.name} [${compProd.id.slice(0, 8)}]`);

      // Move all variants+prices from competitor product to own product
      const compVars = productVariants.get(compProd.id) || [];
      for (const cv of compVars) {
        // Check if own product already has a variant with this color
        const ownVars = productVariants.get(bestMatch.id) || [];
        const existingVar = ownVars.find(ov =>
          (ov.color && cv.color && ov.color.toLowerCase() === cv.color?.toLowerCase()) ||
          (!ov.color && !cv.color)
        );

        if (existingVar) {
          // Move prices from comp variant to own variant
          const { count } = await sb.from('product_prices')
            .update({ variant_id: existingVar.id })
            .eq('variant_id', cv.id) as { count: number };
          console.log(`  → Moved prices from variant ${cv.id.slice(0, 8)} to ${existingVar.id.slice(0, 8)}`);
        } else {
          // Reassign the whole variant to own product
          await sb.from('product_variants')
            .update({ product_id: bestMatch.id })
            .eq('id', cv.id);
          console.log(`  → Reassigned variant ${cv.id.slice(0, 8)} to product ${bestMatch.id.slice(0, 8)}`);
        }
      }

      // Deactivate the competitor product
      await sb.from('products').update({ is_active: false }).eq('id', compProd.id);
      mergedIds.add(compProd.id);
      merged++;
    }
  }

  console.log(`\n=== Totalt mergade: ${merged} ===`);

  // Also try to find inactive products that could match
  // (products that were scraped from competitors but deactivated during cleanup)
  const inactiveProducts = (allProducts || []).filter(p => !p.is_active);
  console.log(`\nInaktiva produkter: ${inactiveProducts.length}`);

  let reactivated = 0;
  for (const inactive of inactiveProducts) {
    if (mergedIds.has(inactive.id)) continue;
    const vars = productVariants.get(inactive.id) || [];
    if (vars.length === 0) continue;

    // Check if this inactive product has competitor prices
    let hasCompPrices = false;
    for (const v of vars) {
      for (const [key] of latestPrice) {
        if (key.startsWith(v.id + ':')) {
          const cid = key.split(':')[1];
          if (!ownIds.has(cid)) { hasCompPrices = true; break; }
        }
      }
      if (hasCompPrices) break;
    }
    if (!hasCompPrices) continue;

    const inactiveFamily = brandFamily(inactive.brand);
    const ownCandidates = ownProds.filter(p => brandFamily(p.brand) === inactiveFamily);

    for (const own of ownCandidates) {
      const score = tokenOverlapScore(own.name, inactive.name);
      if (score >= 0.6) {
        console.log(`\nREACTIVATE+MERGE (score ${score.toFixed(2)}):`);
        console.log(`  Egen: ${own.brand} — ${own.name}`);
        console.log(`  Inaktiv: ${inactive.brand} — ${inactive.name}`);

        // Move variants+prices to own product
        for (const cv of vars) {
          const ownVars = productVariants.get(own.id) || [];
          const existingVar = ownVars.find(ov =>
            (ov.color && cv.color && ov.color.toLowerCase() === cv.color?.toLowerCase()) ||
            (!ov.color && !cv.color)
          );

          if (existingVar) {
            await sb.from('product_prices')
              .update({ variant_id: existingVar.id })
              .eq('variant_id', cv.id);
          } else {
            await sb.from('product_variants')
              .update({ product_id: own.id })
              .eq('id', cv.id);
          }
        }
        reactivated++;
        break;
      }
    }
  }

  console.log(`\nReaktiverade+mergade: ${reactivated}`);

  // Final stats
  const { data: finalPrices } = await sb.from('product_prices').select('variant_id, competitor_id');
  const { data: finalVariants } = await sb.from('product_variants').select('id, product_id');
  const finalVarToProduct = new Map((finalVariants || []).map(v => [v.id, v.product_id]));
  const withOwn = new Set<string>();
  const withComp = new Set<string>();
  for (const p of finalPrices || []) {
    const pid = finalVarToProduct.get(p.variant_id);
    if (!pid) continue;
    if (ownIds.has(p.competitor_id)) withOwn.add(pid);
    else withComp.add(pid);
  }
  const comparable = [...withOwn].filter(id => withComp.has(id));
  console.log(`\nJämförbara produkter: ${comparable.length}`);
}

main().catch(console.error);
