import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

// Shared CSV builder (same logic as client export)
const CATEGORY_LABELS: Record<string, string> = {
  duovagn: 'Duovagn', sittvagn: 'Sittvagn', joggingvagn: 'Joggingvagn',
  vagnspaket: 'Vagnspaket', liggvagn: 'Liggvagn', syskonvagn: 'Syskonvagn',
  babyskydd: 'Babyskydd', 'bakatvänd_bilstol': 'Bakåtvänd bilstol',
  'framåtvänd_bilstol': 'Framåtvänd bilstol', 'bälteskudde': 'Bälteskudde',
  bilstolspaket: 'Bilstolspaket', 'övrigt': 'Övrigt',
};

const CATEGORY_SORT: Record<string, number> = {
  duovagn: 1, sittvagn: 2, liggvagn: 3, syskonvagn: 4, joggingvagn: 5, vagnspaket: 6,
  babyskydd: 10, 'bakatvänd_bilstol': 11, 'framåtvänd_bilstol': 12, 'bälteskudde': 13, bilstolspaket: 14,
  'övrigt': 99,
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().slice(0, 10);

  // Check if snapshot already exists for today — update it if it does
  const { data: existing } = await supabase
    .from('daily_snapshots')
    .select('id')
    .eq('snapshot_date', today)
    .single();

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

  // Deduplicate: latest price per variant+competitor
  const seen = new Set<string>();
  const latestPrices = prices.filter(p => {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group by variant
  const byVariant = new Map<string, typeof latestPrices>();
  for (const p of latestPrices) {
    const arr = byVariant.get(p.variant_id) || [];
    arr.push(p);
    byVariant.set(p.variant_id, arr);
  }

  const ownStoreIds = new Set(
    (competitors || []).filter(c => c.is_own_store).map(c => c.id)
  );

  interface Row {
    kategoriGrupp: string;
    kategoriSort: number;
    kategori: string;
    varumärke: string;
    produkt: string;
    variant: string;
    färg: string;
    butik: string;
    egenButik: boolean;
    pris: number;
    ordinariePris: number | null;
    iLager: boolean;
    dittPris: number | null;
    lägstaPris: number | null;
    lägstaButik: string;
    prisskillnadKr: number | null;
    prisskillnadPct: string;
    antalButiker: number;
    url: string;
  }

  const rows: Row[] = [];
  const uniqueProducts = new Set<string>();

  for (const [variantId, variantPrices] of byVariant) {
    const variant = variantMap.get(variantId);
    if (!variant) continue;
    const product = productMap.get(variant.product_id);
    if (!product) continue;
    uniqueProducts.add(product.id);

    const category = product.category;
    const catSort = CATEGORY_SORT[category] ?? 99;
    const isBarnvagn = catSort < 10;
    const isBilstol = catSort >= 10 && catSort < 99;
    const kategoriGrupp = isBarnvagn ? 'Barnvagnar' : isBilstol ? 'Bilstolar' : 'Övrigt';

    const ownPriceEntry = variantPrices.find(p => ownStoreIds.has(p.competitor_id));
    const ownPrice = ownPriceEntry?.price ?? null;

    const allActive = variantPrices.filter(p => p.price > 0);
    const lowestEntry = allActive.reduce<(typeof latestPrices)[0] | null>(
      (min, p) => (!min || p.price < min.price ? p : min), null
    );
    const lowestPrice = lowestEntry?.price ?? null;
    const lowestStore = lowestEntry ? (competitorMap.get(lowestEntry.competitor_id)?.name ?? '') : '';

    const antalButiker = new Set(variantPrices.map(p => p.competitor_id)).size;

    for (const p of variantPrices) {
      const comp = competitorMap.get(p.competitor_id);
      if (!comp) continue;

      let prisskillnadKr: number | null = null;
      let prisskillnadPct = '';
      if (ownPrice !== null && p.price > 0 && !ownStoreIds.has(p.competitor_id)) {
        prisskillnadKr = p.price - ownPrice;
        const pct = ((p.price - ownPrice) / ownPrice) * 100;
        prisskillnadPct = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
      }

      rows.push({
        kategoriGrupp, kategoriSort: catSort, kategori: CATEGORY_LABELS[category] || category,
        varumärke: product.brand, produkt: product.name, variant: variant.variant_name || '',
        färg: variant.color || '', butik: comp.name, egenButik: comp.is_own_store,
        pris: p.price, ordinariePris: p.original_price, iLager: p.in_stock,
        dittPris: ownPrice, lägstaPris: lowestPrice, lägstaButik: lowestStore,
        prisskillnadKr, prisskillnadPct, antalButiker, url: p.url || '',
      });
    }
  }

  rows.sort((a, b) => {
    if (a.kategoriSort !== b.kategoriSort) return a.kategoriSort - b.kategoriSort;
    if (a.varumärke !== b.varumärke) return a.varumärke.localeCompare(b.varumärke, 'sv');
    if (a.produkt !== b.produkt) return a.produkt.localeCompare(b.produkt, 'sv');
    if (a.variant !== b.variant) return a.variant.localeCompare(b.variant, 'sv');
    if (a.egenButik !== b.egenButik) return a.egenButik ? -1 : 1;
    return a.butik.localeCompare(b.butik, 'sv');
  });

  const headers = [
    'Datum', 'Grupp', 'Kategori', 'Varumärke', 'Produkt', 'Variant', 'Färg',
    'Butik', 'Egen butik', 'Pris (SEK)', 'Ord. pris (SEK)', 'Rea', 'I lager',
    'Ditt pris (SEK)', 'Lägsta pris (SEK)', 'Lägsta hos',
    'Diff vs dig (SEK)', 'Diff vs dig (%)', 'Antal butiker', 'URL',
  ];

  const escape = (cell: string | number) => {
    const str = String(cell);
    return str.includes(';') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const csvContent = [
    headers.join(';'),
    ...rows.map(r => [
      today, r.kategoriGrupp, r.kategori, r.varumärke, r.produkt, r.variant, r.färg,
      r.butik, r.egenButik ? 'Ja' : 'Nej', r.pris, r.ordinariePris ?? '',
      r.ordinariePris && r.ordinariePris > r.pris ? 'Ja' : '', r.iLager ? 'Ja' : 'Nej',
      r.dittPris ?? '', r.lägstaPris ?? '', r.lägstaButik,
      r.prisskillnadKr ?? '', r.prisskillnadPct, r.antalButiker, r.url,
    ].map(escape).join(';')),
  ].join('\n');

  const fileName = `prisrapport-${today}.csv`;

  if (existing) {
    const { error } = await supabase.from('daily_snapshots')
      .update({ file_name: fileName, csv_data: csvContent, products_count: uniqueProducts.size })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from('daily_snapshots').insert({
      snapshot_date: today, file_name: fileName, csv_data: csvContent, products_count: uniqueProducts.size,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: existing ? 'Snapshot updated' : 'Snapshot created',
    date: today, fileName, productsCount: uniqueProducts.size, rowCount: rows.length,
  });
}
