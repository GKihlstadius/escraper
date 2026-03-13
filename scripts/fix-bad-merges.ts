// Fix the bad merges from rematch script by re-checking all merged products
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// These were incorrectly merged (different product types)
const BAD_MERGES = [
  {
    ownId: 'b7dbef1d', // Cybex e-Priam Duovagn
    wrongId: '88c8618c', // Cybex Mios Duovagn — different model!
    reason: 'e-Priam ≠ Mios'
  },
  {
    ownId: '95d3098c', // Britax Dualfix M Plus
    wrongId: 'aa9f6273', // Britax Baby-Safe Core Babyskydd — bilstol ≠ babyskydd!
    reason: 'Dualfix (bilstol) ≠ Baby-Safe (babyskydd)'
  },
  {
    ownId: '86a2490a', // Britax Smile 5Z Duovagn
    wrongId: '8724aaec', // Britax Smile 5Z Lux Sittvagn — Lux is different
    reason: 'Smile 5Z ≠ Smile 5Z Lux'
  },
];

async function main() {
  for (const merge of BAD_MERGES) {
    // Find the full IDs
    const { data: ownProd } = await sb.from('products').select('id, name, brand')
      .ilike('id', `${merge.ownId}%`).single();
    const { data: wrongProd } = await sb.from('products').select('id, name, brand')
      .ilike('id', `${merge.wrongId}%`).single();

    if (!ownProd || !wrongProd) {
      console.log(`Could not find products for merge: ${merge.ownId} / ${merge.wrongId}`);
      continue;
    }

    console.log(`\nUNDOING: ${merge.reason}`);
    console.log(`  Egen: ${ownProd.name} [${ownProd.id.slice(0, 8)}]`);
    console.log(`  Fel:  ${wrongProd.name} [${wrongProd.id.slice(0, 8)}]`);

    // Find variants that were reassigned to own product but belong to wrong product
    // These are variants where the original product_id was the wrong product
    // We need to move them back — but we can't easily know which variants were moved
    // So let's check: are there variants on ownProd that have prices from competitors
    // that the wrong product originally had?

    // Reactivate the wrong product
    await sb.from('products').update({ is_active: true }).eq('id', wrongProd.id);
    console.log(`  Reactivated ${wrongProd.name}`);

    // Get all variants currently on ownProd
    const { data: ownVars } = await sb.from('product_variants').select('id, product_id, variant_name, color')
      .eq('product_id', ownProd.id);

    // Check the wrong product's variants (they might have been reassigned)
    const { data: wrongVars } = await sb.from('product_variants').select('id, product_id, variant_name, color')
      .eq('product_id', wrongProd.id);

    console.log(`  Own variants: ${(ownVars || []).length}, Wrong variants: ${(wrongVars || []).length}`);

    // If wrong product has no variants left, some were moved to own product
    // We need to check which variants on own product have competitor prices
    // that should belong to wrong product
    if ((wrongVars || []).length === 0) {
      // All variants were moved to own product — move back those that
      // have names/colors matching the wrong product
      for (const v of ownVars || []) {
        // Check if this variant has prices — if its name matches wrongProd more than ownProd
        const vNameLower = (v.variant_name || '').toLowerCase();
        const wrongNameLower = wrongProd.name.toLowerCase();
        const ownNameLower = ownProd.name.toLowerCase();

        // Simple heuristic: if variant name contains words from wrong product
        // that aren't in own product, it was probably moved
        const wrongWords = new Set(wrongNameLower.split(/\s+/));
        const ownWords = new Set(ownNameLower.split(/\s+/));
        const vWords = new Set(vNameLower.split(/\s+/));

        let wrongMatches = 0, ownMatches = 0;
        for (const w of vWords) {
          if (wrongWords.has(w) && !ownWords.has(w)) wrongMatches++;
          if (ownWords.has(w) && !wrongWords.has(w)) ownMatches++;
        }

        if (wrongMatches > ownMatches) {
          console.log(`  Moving variant back: ${v.variant_name} → ${wrongProd.id.slice(0, 8)}`);
          await sb.from('product_variants').update({ product_id: wrongProd.id }).eq('id', v.id);
        }
      }
    }
  }

  // Also undo: Stokke Sleepi mini merged with Stokke Sleepi Dresser (bed ≠ dresser)
  console.log('\nNote: Stokke Sleepi mini/Dresser merge was also bad but only moved prices, no variants reassigned');

  // Check final state
  const { data: comps } = await sb.from('competitors').select('id, is_own_store').eq('is_active', true);
  const ownIds = new Set((comps || []).filter(c => c.is_own_store).map(c => c.id));
  const { data: finalPrices } = await sb.from('product_prices').select('variant_id, competitor_id');
  const { data: finalVariants } = await sb.from('product_variants').select('id, product_id');
  const vtp = new Map((finalVariants || []).map(v => [v.id, v.product_id]));
  const withOwn = new Set<string>();
  const withComp = new Set<string>();
  for (const p of finalPrices || []) {
    const pid = vtp.get(p.variant_id);
    if (!pid) continue;
    if (ownIds.has(p.competitor_id)) withOwn.add(pid);
    else withComp.add(pid);
  }
  console.log(`\nJämförbara produkter: ${[...withOwn].filter(id => withComp.has(id)).length}`);
}

main().catch(console.error);
