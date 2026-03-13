'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Download } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  duovagn: 'Duovagn',
  sittvagn: 'Sittvagn',
  joggingvagn: 'Joggingvagn',
  vagnspaket: 'Vagnspaket',
  liggvagn: 'Liggvagn',
  syskonvagn: 'Syskonvagn',
  babyskydd: 'Babyskydd',
  'bakatvänd_bilstol': 'Bakåtvänd bilstol',
  'framåtvänd_bilstol': 'Framåtvänd bilstol',
  'bälteskudde': 'Bälteskudde',
  bilstolspaket: 'Bilstolspaket',
  'övrigt': 'Övrigt',
};

const CATEGORY_SORT: Record<string, number> = {
  duovagn: 1, sittvagn: 2, liggvagn: 3, syskonvagn: 4, joggingvagn: 5, vagnspaket: 6,
  babyskydd: 10, 'bakatvänd_bilstol': 11, 'framåtvänd_bilstol': 12, 'bälteskudde': 13, bilstolspaket: 14,
  'övrigt': 99,
};

interface PriceRow {
  variant_id: string;
  competitor_id: string;
  price: number;
  original_price: number | null;
  in_stock: boolean;
  url: string;
  scraped_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  brand: string;
  category: string;
}

interface VariantRow {
  id: string;
  product_id: string;
  variant_name: string;
  color: string | null;
}

interface CompetitorRow {
  id: string;
  name: string;
  is_own_store: boolean;
}

export function buildExportCSV(
  prices: PriceRow[],
  products: ProductRow[],
  variants: VariantRow[],
  competitors: CompetitorRow[],
  date: string
): string {
  const productMap = new Map(products.map(p => [p.id, p]));
  const variantMap = new Map(variants.map(v => [v.id, v]));
  const competitorMap = new Map(competitors.map(c => [c.id, c]));

  // Deduplicate: latest price per variant+competitor
  const seen = new Set<string>();
  const latestPrices = prices.filter(p => {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group prices by variant
  const byVariant = new Map<string, PriceRow[]>();
  for (const p of latestPrices) {
    const arr = byVariant.get(p.variant_id) || [];
    arr.push(p);
    byVariant.set(p.variant_id, arr);
  }

  // Get own store IDs
  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));

  // Build enriched rows
  interface EnrichedRow {
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

  const rows: EnrichedRow[] = [];

  for (const [variantId, variantPrices] of byVariant) {
    const variant = variantMap.get(variantId);
    if (!variant) continue;
    const product = productMap.get(variant.product_id);
    if (!product) continue;

    const category = product.category;
    const catSort = CATEGORY_SORT[category] ?? 99;
    const isBarnvagn = catSort < 10;
    const isBilstol = catSort >= 10 && catSort < 99;
    const kategoriGrupp = isBarnvagn ? 'Barnvagnar' : isBilstol ? 'Bilstolar' : 'Övrigt';

    // Find own price and lowest competitor price
    const ownPriceEntry = variantPrices.find(p => ownStoreIds.has(p.competitor_id));
    const ownPrice = ownPriceEntry?.price ?? null;

    const allActivePrices = variantPrices.filter(p => p.price > 0);
    const lowestEntry = allActivePrices.reduce<PriceRow | null>(
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
        kategoriGrupp,
        kategoriSort: catSort,
        kategori: CATEGORY_LABELS[category] || category,
        varumärke: product.brand,
        produkt: product.name,
        variant: variant.variant_name || '',
        färg: variant.color || '',
        butik: comp.name,
        egenButik: comp.is_own_store,
        pris: p.price,
        ordinariePris: p.original_price,
        iLager: p.in_stock,
        dittPris: ownPrice,
        lägstaPris: lowestPrice,
        lägstaButik: lowestStore,
        prisskillnadKr,
        prisskillnadPct,
        antalButiker,
        url: p.url || '',
      });
    }
  }

  // Sort: barnvagnar first, then bilstolar, then övrigt; within each: brand → product → store
  rows.sort((a, b) => {
    if (a.kategoriSort !== b.kategoriSort) return a.kategoriSort - b.kategoriSort;
    if (a.varumärke !== b.varumärke) return a.varumärke.localeCompare(b.varumärke, 'sv');
    if (a.produkt !== b.produkt) return a.produkt.localeCompare(b.produkt, 'sv');
    if (a.variant !== b.variant) return a.variant.localeCompare(b.variant, 'sv');
    // Own store first
    if (a.egenButik !== b.egenButik) return a.egenButik ? -1 : 1;
    return a.butik.localeCompare(b.butik, 'sv');
  });

  const headers = [
    'Datum',
    'Grupp',
    'Kategori',
    'Varumärke',
    'Produkt',
    'Variant',
    'Färg',
    'Butik',
    'Egen butik',
    'Pris (SEK)',
    'Ord. pris (SEK)',
    'Rea',
    'I lager',
    'Ditt pris (SEK)',
    'Lägsta pris (SEK)',
    'Lägsta hos',
    'Diff vs dig (SEK)',
    'Diff vs dig (%)',
    'Antal butiker',
    'URL',
  ];

  const csvRows = rows.map(r => [
    date,
    r.kategoriGrupp,
    r.kategori,
    r.varumärke,
    r.produkt,
    r.variant,
    r.färg,
    r.butik,
    r.egenButik ? 'Ja' : 'Nej',
    r.pris,
    r.ordinariePris ?? '',
    r.ordinariePris && r.ordinariePris > r.pris ? 'Ja' : '',
    r.iLager ? 'Ja' : 'Nej',
    r.dittPris ?? '',
    r.lägstaPris ?? '',
    r.lägstaButik,
    r.prisskillnadKr ?? '',
    r.prisskillnadPct,
    r.antalButiker,
    r.url,
  ]);

  const escape = (cell: string | number) => {
    const str = String(cell);
    return str.includes(';') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"` : str;
  };

  return [
    headers.join(';'),
    ...csvRows.map(row => row.map(escape).join(';')),
  ].join('\n');
}

export function ExportButton() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const supabase = createClient();

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
        alert('Ingen prisdata att exportera');
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const csvContent = buildExportCSV(
        prices as PriceRow[],
        products as ProductRow[],
        variants as VariantRow[],
        competitors as CompetitorRow[],
        today
      );

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prisdata-${today}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export misslyckades');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border border-zinc-100 text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
    >
      <span className="flex items-center gap-2">
        <Download className="h-3.5 w-3.5" />
        {loading ? 'Exporterar...' : 'Exportera dagsdata'}
      </span>
    </button>
  );
}
