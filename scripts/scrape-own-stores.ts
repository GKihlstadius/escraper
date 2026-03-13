import { createClient } from '@supabase/supabase-js';
import { scrapeCompetitor } from '../src/lib/scraper/pipeline';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  // Get own stores
  const { data: ownStores } = await sb
    .from('competitors')
    .select('id, name, url, sitemap_url')
    .eq('is_own_store', true)
    .eq('is_active', true);

  console.log('Own stores:', ownStores?.map(s => s.name).join(', '));

  for (const store of ownStores || []) {
    console.log(`\nScraping: ${store.name}...`);
    try {
      const result = await scrapeCompetitor(store.id);
      console.log(`  Products: ${result.productsScraped}`);
      console.log(`  New prices: ${result.newPrices}`);
      console.log(`  Alerts: ${result.alerts}`);
      if (result.errors.length > 0) {
        console.log(`  Errors (${result.errors.length}):`, result.errors.slice(0, 5).join('\n    '));
      }
    } catch (err) {
      console.error(`  FAILED: ${err}`);
    }
  }

  // Then re-scrape all competitors too
  const { data: competitors } = await sb
    .from('competitors')
    .select('id, name')
    .eq('is_own_store', false)
    .eq('is_active', true);

  for (const c of competitors || []) {
    console.log(`\nScraping competitor: ${c.name}...`);
    try {
      const result = await scrapeCompetitor(c.id);
      console.log(`  Products: ${result.productsScraped}, New prices: ${result.newPrices}`);
      if (result.errors.length > 0) {
        console.log(`  Errors (${result.errors.length}):`, result.errors.slice(0, 3).join('; '));
      }
    } catch (err) {
      console.error(`  FAILED: ${err}`);
    }
  }

  // Final stats
  console.log('\n--- Final matching stats ---');
  const { data: variants } = await sb.from('product_variants').select('id, product_id');
  const variantToProduct = new Map((variants || []).map(v => [v.id, v.product_id]));
  const { data: prices } = await sb.from('product_prices').select('variant_id, competitor_id').order('scraped_at', { ascending: false });
  const { data: comps } = await sb.from('competitors').select('id, name, is_own_store').eq('is_active', true);
  const ownIds = new Set((comps || []).filter(c => c.is_own_store).map(c => c.id));

  const productComps = new Map<string, Set<string>>();
  for (const p of prices || []) {
    const pid = variantToProduct.get(p.variant_id);
    if (!pid) continue;
    if (!productComps.has(pid)) productComps.set(pid, new Set());
    productComps.get(pid)!.add(p.competitor_id);
  }

  const compProductCount = new Map<string, number>();
  for (const [, compSet] of productComps) {
    for (const cid of compSet) {
      compProductCount.set(cid, (compProductCount.get(cid) || 0) + 1);
    }
  }

  console.log('\nProdukter per butik:');
  for (const c of comps || []) {
    console.log(`  ${c.name}: ${compProductCount.get(c.id) || 0}${c.is_own_store ? ' (egen)' : ''}`);
  }

  let ownOnly = 0, ownWithMatch = 0, ownTotal = 0;
  for (const [, compSet] of productComps) {
    const hasOwn = [...compSet].some(id => ownIds.has(id));
    if (!hasOwn) continue;
    ownTotal++;
    const hasOther = [...compSet].some(id => !ownIds.has(id));
    if (hasOther) ownWithMatch++;
    else ownOnly++;
  }
  console.log('\nMatchning:');
  console.log(`  Egna produkter med prisdata: ${ownTotal}`);
  console.log(`  Med matchning hos konkurrent: ${ownWithMatch}`);
  console.log(`  Utan matchning: ${ownOnly}`);
  console.log(`  Matchningsgrad: ${ownTotal > 0 ? Math.round((ownWithMatch / ownTotal) * 100) : 0}%`);
}

main().catch(console.error);
