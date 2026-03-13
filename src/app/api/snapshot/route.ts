import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().slice(0, 10);

  // Check if snapshot already exists for today
  const { data: existing } = await supabase
    .from('daily_snapshots')
    .select('id')
    .eq('snapshot_date', today)
    .single();

  if (existing) {
    return NextResponse.json({ message: 'Snapshot already exists for today', date: today });
  }

  // Fetch all current price data
  const [{ data: prices }, { data: products }, { data: variants }, { data: competitors }] = await Promise.all([
    supabase
      .from('product_prices')
      .select('variant_id, competitor_id, price, original_price, in_stock, url, scraped_at')
      .order('scraped_at', { ascending: false }),
    supabase.from('products').select('id, name, brand, category').eq('is_active', true),
    supabase.from('product_variants').select('id, product_id, variant_name, color'),
    supabase.from('competitors').select('id, name, is_own_store').eq('is_active', true),
  ]);

  if (!prices?.length) {
    return NextResponse.json({ message: 'No price data to snapshot', date: today });
  }

  const productMap = new Map((products || []).map(p => [p.id, p]));
  const variantMap = new Map((variants || []).map(v => [v.id, v]));
  const competitorMap = new Map((competitors || []).map(c => [c.id, c]));

  // Deduplicate: keep only latest price per variant+competitor
  const seen = new Set<string>();
  const latestPrices = prices.filter(p => {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build CSV
  const headers = [
    'Datum', 'Produkt', 'Varumärke', 'Kategori', 'Variant',
    'Butik', 'Egen butik', 'Pris', 'Ordinarie pris', 'I lager', 'URL',
  ];

  const rows = latestPrices.map(p => {
    const variant = variantMap.get(p.variant_id);
    const product = variant ? productMap.get(variant.product_id) : null;
    const competitor = competitorMap.get(p.competitor_id);

    return [
      today,
      product?.name || '',
      product?.brand || '',
      product?.category || '',
      variant?.variant_name || variant?.color || '',
      competitor?.name || '',
      competitor?.is_own_store ? 'Ja' : 'Nej',
      p.price,
      p.original_price || '',
      p.in_stock ? 'Ja' : 'Nej',
      p.url || '',
    ];
  });

  const csvContent = [
    headers.join(';'),
    ...rows.map(row =>
      row.map(cell => {
        const str = String(cell);
        return str.includes(';') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(';')
    ),
  ].join('\n');

  const fileName = `prisrapport-${today}.csv`;

  // Count unique products
  const uniqueProducts = new Set(
    latestPrices
      .map(p => variantMap.get(p.variant_id)?.product_id)
      .filter(Boolean)
  );

  // Save to Supabase
  const { error } = await supabase.from('daily_snapshots').insert({
    snapshot_date: today,
    file_name: fileName,
    csv_data: csvContent,
    products_count: uniqueProducts.size,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: 'Snapshot created',
    date: today,
    fileName,
    productsCount: uniqueProducts.size,
    rowCount: rows.length,
  });
}
