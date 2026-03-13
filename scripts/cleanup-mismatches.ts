import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
  const compMap = new Map((comps || []).map(c => [c.id, c]));
  const ownIds = new Set((comps || []).filter(c => c.is_own_store).map(c => c.id));

  const { data: variants } = await sb.from('product_variants').select('id, product_id');
  const varToProduct = new Map((variants || []).map(v => [v.id, v.product_id]));
  const productVariants = new Map<string, string[]>();
  for (const v of variants || []) {
    if (!productVariants.has(v.product_id)) productVariants.set(v.product_id, []);
    productVariants.get(v.product_id)!.push(v.id);
  }

  const { data: products } = await sb.from('products').select('id, name, brand').eq('is_active', true);
  const prodMap = new Map((products || []).map(p => [p.id, p]));

  const { data: prices } = await sb.from('product_prices').select('id, variant_id, competitor_id, price, url').order('scraped_at', { ascending: false });

  // Get latest price per variant+competitor
  const latest = new Map<string, { id: string; price: number; url: string | null }>();
  for (const p of prices || []) {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (!latest.has(key)) latest.set(key, { id: p.id, price: p.price, url: p.url });
  }

  // Find mismatched prices (own vs competitor >80% diff)
  const prodPrices = new Map<string, { own: number[]; comp: { compId: string; name: string; price: number; variantId: string }[] }>();
  for (const [key, val] of latest) {
    const [vid, cid] = key.split(':');
    const pid = varToProduct.get(vid);
    if (!pid) continue;
    if (!prodPrices.has(pid)) prodPrices.set(pid, { own: [], comp: [] });
    const entry = prodPrices.get(pid)!;
    if (ownIds.has(cid)) entry.own.push(val.price);
    else entry.comp.push({ compId: cid, name: compMap.get(cid)?.name || '?', price: val.price, variantId: vid });
  }

  // Delete mismatched competitor prices
  let deletedPrices = 0;
  for (const [pid, data] of prodPrices) {
    if (data.own.length === 0 || data.comp.length === 0) continue;
    const ownAvg = data.own.reduce((a, b) => a + b, 0) / data.own.length;
    for (const c of data.comp) {
      const ratio = c.price / ownAvg;
      if (ratio > 2.0 || ratio < 0.4) {
        const prod = prodMap.get(pid);
        console.log(`REMOVING: ${prod?.name} (${prod?.brand}) — Eget: ${Math.round(ownAvg)} kr vs ${c.name}: ${c.price} kr (ratio: ${ratio.toFixed(1)}x)`);

        // Delete ALL prices for this variant+competitor combo
        const { count } = await sb.from('product_prices')
          .delete({ count: 'exact' })
          .eq('variant_id', c.variantId)
          .eq('competitor_id', c.compId);
        deletedPrices += count || 0;
      }
    }
  }
  console.log(`\nTotalt borttagna prisposter: ${deletedPrices}`);

  // Remove empty products (no variants or no prices)
  let deactivated = 0;
  for (const prod of products || []) {
    const varIds = productVariants.get(prod.id) || [];
    if (varIds.length === 0) {
      console.log(`DEACTIVATING (no variants): ${prod.name} (${prod.brand})`);
      await sb.from('products').update({ is_active: false }).eq('id', prod.id);
      deactivated++;
      continue;
    }

    // Check if any variant has prices
    let hasPrices = false;
    for (const vid of varIds) {
      for (const [key] of latest) {
        if (key.startsWith(vid + ':')) { hasPrices = true; break; }
      }
      if (hasPrices) break;
    }

    if (!hasPrices) {
      console.log(`DEACTIVATING (no prices): ${prod.name} (${prod.brand})`);
      await sb.from('products').update({ is_active: false }).eq('id', prod.id);
      deactivated++;
    }
  }
  console.log(`\nAvaktiverade produkter: ${deactivated}`);

  // Re-check comparable count after cleanup
  const { data: newPrices2 } = await sb.from('product_prices').select('variant_id, competitor_id');
  const withOwn = new Set<string>();
  const withComp = new Set<string>();
  for (const p of newPrices2 || []) {
    const pid = varToProduct.get(p.variant_id);
    if (!pid) continue;
    if (ownIds.has(p.competitor_id)) withOwn.add(pid);
    else withComp.add(pid);
  }
  const comparable = [...withOwn].filter(id => withComp.has(id));
  console.log(`\nJämförbara produkter efter cleanup: ${comparable.length}`);
}

main().catch(console.error);
