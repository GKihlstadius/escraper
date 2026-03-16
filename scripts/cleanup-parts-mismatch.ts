// Find and remove mismatched prices where parts/accessories
// (liggdel, sittdel, chassi etc) are matched against full products
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { extractProductType, isBundle } from '../src/lib/scraper/parser';
config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (DRY_RUN) console.log('=== DRY RUN — inga ändringar görs ===\n');

  const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
  const compMap = new Map((comps || []).map(c => [c.id, c]));
  const ownIds = new Set((comps || []).filter(c => c.is_own_store).map(c => c.id));

  const { data: products } = await sb.from('products').select('id, name, brand').eq('is_active', true);
  const prodMap = new Map((products || []).map(p => [p.id, p]));

  const { data: variants } = await sb.from('product_variants').select('id, product_id, variant_name');
  const varToProduct = new Map((variants || []).map(v => [v.id, v.product_id]));

  // Get all product_matches to check matched_name
  const { data: matches } = await sb.from('product_matches').select('id, product_id, competitor_id, matched_name, matched_brand');

  // Get latest prices per variant+competitor
  const { data: prices } = await sb.from('product_prices')
    .select('id, variant_id, competitor_id, price, url')
    .order('scraped_at', { ascending: false });

  const latest = new Map<string, { id: string; price: number; url: string | null }>();
  for (const p of prices || []) {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (!latest.has(key)) latest.set(key, { id: p.id, price: p.price, url: p.url });
  }

  // Check product_matches for type incompatibility
  let badMatches = 0;
  for (const match of matches || []) {
    const prod = prodMap.get(match.product_id);
    if (!prod) continue;

    const ownType = extractProductType(prod.name);
    const matchedType = extractProductType(match.matched_name);
    const ownBundle = isBundle(prod.name);
    const matchedBundle = isBundle(match.matched_name);

    const incompatible =
      (ownBundle !== matchedBundle) ||
      (ownType && matchedType && ownType !== matchedType);

    if (incompatible) {
      console.log(`BAD MATCH: "${prod.name}" (${ownType || 'okänd'}) ↔ "${match.matched_name}" (${matchedType || 'okänd'}) @ ${compMap.get(match.competitor_id)?.name || '?'}`);
      badMatches++;

      if (!DRY_RUN) {
        // Delete the match
        await sb.from('product_matches').delete().eq('id', match.id);

        // Delete prices for this product+competitor combo
        const prodVarIds = (variants || [])
          .filter(v => v.product_id === match.product_id)
          .map(v => v.id);

        for (const vid of prodVarIds) {
          const { count } = await sb.from('product_prices')
            .delete({ count: 'exact' })
            .eq('variant_id', vid)
            .eq('competitor_id', match.competitor_id);
          if (count && count > 0) {
            console.log(`  → Tog bort ${count} prisposter`);
          }
        }
      }
    }
  }

  // Also check for price ratio mismatches (>75% diff) that might not have product_matches
  let priceIssues = 0;
  const prodPrices = new Map<string, { own: number[]; comp: { compId: string; name: string; price: number; variantId: string; url: string | null }[] }>();

  for (const [key, val] of latest) {
    const [vid, cid] = key.split(':');
    const pid = varToProduct.get(vid);
    if (!pid) continue;
    if (!prodPrices.has(pid)) prodPrices.set(pid, { own: [], comp: [] });
    const entry = prodPrices.get(pid)!;
    if (ownIds.has(cid)) entry.own.push(val.price);
    else entry.comp.push({ compId: cid, name: compMap.get(cid)?.name || '?', price: val.price, variantId: vid, url: val.url });
  }

  for (const [pid, data] of prodPrices) {
    if (data.own.length === 0 || data.comp.length === 0) continue;
    const ownAvg = data.own.reduce((a, b) => a + b, 0) / data.own.length;

    for (const c of data.comp) {
      const ratio = c.price / ownAvg;
      if (ratio < 0.4 || ratio > 2.5) {
        const prod = prodMap.get(pid);
        console.log(`PRICE MISMATCH: ${prod?.name} — Eget: ${Math.round(ownAvg)} kr vs ${c.name}: ${c.price} kr (${Math.round((1 - ratio) * 100)}% diff) ${c.url || ''}`);
        priceIssues++;

        if (!DRY_RUN) {
          const { count } = await sb.from('product_prices')
            .delete({ count: 'exact' })
            .eq('variant_id', c.variantId)
            .eq('competitor_id', c.compId);
          if (count && count > 0) {
            console.log(`  → Tog bort ${count} prisposter`);
          }
        }
      }
    }
  }

  console.log(`\n=== Sammanfattning ===`);
  console.log(`Typmismatchade matchningar: ${badMatches}`);
  console.log(`Prismismatchade poster: ${priceIssues}`);
  if (DRY_RUN) console.log(`\nKör utan --dry-run för att rensa`);
}

main().catch(console.error);
