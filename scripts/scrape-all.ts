import { createClient } from '@supabase/supabase-js';
import { scrapeCompetitor, generateRecommendations } from '../src/lib/scraper/pipeline';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const { data: competitors } = await supabase
    .from('competitors')
    .select('id, name, url, sitemap_url, is_active')
    .eq('is_active', true);

  console.log('Active competitors:', competitors?.length);
  if (!competitors) return;

  for (const c of competitors) {
    console.log(`\nScraping: ${c.name}...`);
    try {
      const result = await scrapeCompetitor(c.id);
      console.log(`  Products: ${result.productsScraped}, New prices: ${result.newPrices}, Alerts: ${result.alerts}`);
      if (result.errors.length > 0) {
        console.log(`  Errors (${result.errors.length}):`, result.errors.slice(0, 3).join('; '));
      }
    } catch (err) {
      console.error(`  FAILED: ${err}`);
    }
  }

  console.log('\nGenerating recommendations...');
  await generateRecommendations().catch(console.error);
  console.log('Done!');
}

main();
