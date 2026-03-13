// Full scrape: processes ALL URLs for ALL competitors with pagination
// Run: npx tsx scripts/full-scrape.ts
import { config } from 'dotenv';
config({ path: '.env.local' });

import { scrapeCompetitor, generateRecommendations } from '../src/lib/scraper/pipeline';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== STARTAR FULL SCRAPE ===\n');

  const { data: competitors } = await sb
    .from('competitors')
    .select('id, name, is_own_store')
    .eq('is_active', true)
    .order('is_own_store', { ascending: false });

  if (!competitors?.length) {
    console.log('Inga aktiva konkurrenter');
    return;
  }

  const allResults: Record<string, { total: number; urls: number }> = {};

  for (const comp of competitors) {
    console.log(`\n📦 ${comp.name}${comp.is_own_store ? ' (egen butik)' : ''}`);
    let offset = 0;
    let totalScraped = 0;
    let totalUrls = 0;
    let pass = 1;

    while (true) {
      const start = Date.now();
      console.log(`  Omgång ${pass}, offset=${offset}...`);

      try {
        const result = await scrapeCompetitor(comp.id, undefined, offset);
        totalScraped += result.productsScraped;
        totalUrls = result.totalUrls;
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        console.log(`  ✓ ${result.productsScraped} produkter (${result.urlsProcessed}/${result.totalUrls} URLer) [${elapsed}s]`);

        if (result.errors.length > 0) {
          const errorSummary = result.errors.slice(0, 3).map(e => e.substring(0, 100));
          errorSummary.forEach(e => console.log(`    ⚠ ${e}`));
          if (result.errors.length > 3) console.log(`    ... och ${result.errors.length - 3} till`);
        }

        if (result.hasMore && result.urlsProcessed > offset) {
          offset = result.urlsProcessed;
          pass++;
          continue;
        }
      } catch (err) {
        console.log(`  ✗ Fel: ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }

    allResults[comp.name] = { total: totalScraped, urls: totalUrls };
    console.log(`  TOTALT: ${totalScraped} produkter av ${totalUrls} URLer`);
  }

  console.log('\n=== GENERERAR REKOMMENDATIONER ===');
  await generateRecommendations().catch(e => console.error('Rec error:', e instanceof Error ? e.message : e));

  console.log('\n=== SAMMANFATTNING ===');
  for (const [name, r] of Object.entries(allResults)) {
    console.log(`  ${name}: ${r.total} produkter (${r.urls} URLer)`);
  }

  const { count: totalProducts } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
  const { count: totalPrices } = await sb.from('product_prices').select('id', { count: 'exact', head: true });
  console.log(`\n  Totalt i DB: ${totalProducts} produkter, ${totalPrices} prisrader`);
}

main().catch(console.error);
