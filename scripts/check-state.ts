import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Products with prices from multiple competitors (price comparison candidates)
  const { data: products } = await supabase.from('products').select('id, name, brand, category');
  console.log('Total products:', products?.length);

  // Check how many products have prices from 2+ competitors
  const { data: prices } = await supabase.from('product_prices').select('variant_id, competitor_id');
  const variantCompetitors = new Map<string, Set<string>>();
  for (const p of prices || []) {
    if (!variantCompetitors.has(p.variant_id)) variantCompetitors.set(p.variant_id, new Set());
    variantCompetitors.get(p.variant_id)!.add(p.competitor_id);
  }

  let multiStore = 0;
  for (const [, comps] of variantCompetitors) {
    if (comps.size >= 2) multiStore++;
  }
  console.log('Variants with 2+ competitor prices:', multiStore);
  console.log('Total variants with prices:', variantCompetitors.size);

  // Prices per competitor
  const { data: competitors } = await supabase.from('competitors').select('id, name, is_own_store');
  const compPrices = new Map<string, number>();
  for (const p of prices || []) {
    compPrices.set(p.competitor_id, (compPrices.get(p.competitor_id) || 0) + 1);
  }
  console.log('\nPrices per competitor:');
  for (const c of competitors || []) {
    console.log(`  ${c.name}${c.is_own_store ? ' (OWN)' : ''}: ${compPrices.get(c.id) || 0}`);
  }

  // Category distribution
  const cats: Record<string, number> = {};
  for (const p of products || []) {
    cats[p.category] = (cats[p.category] || 0) + 1;
  }
  console.log('\nCategories:', cats);

  // Alerts
  const { data: alerts } = await supabase.from('alerts').select('type, severity, title').order('created_at', { ascending: false }).limit(10);
  console.log('\nRecent alerts:', alerts?.length);
  alerts?.forEach(a => console.log(`  [${a.severity}] ${a.type}: ${a.title}`));

  // Scraping logs
  const { data: logs } = await supabase.from('scraping_logs').select('status, message, products_scraped, duration_ms').order('created_at', { ascending: false }).limit(10);
  console.log('\nRecent scraping logs:');
  logs?.forEach(l => console.log(`  [${l.status}] ${l.message} (${l.products_scraped} products, ${l.duration_ms}ms)`));
}

main();
