'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Download, ChevronDown } from 'lucide-react';

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

const escape = (cell: string | number) => {
  const str = String(cell);
  return str.includes(';') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"` : str;
};

// ── Format 1: Dagsdata (original flat CSV) ──
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

  const seen = new Set<string>();
  const latestPrices = prices.filter(p => {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const byVariant = new Map<string, PriceRow[]>();
  for (const p of latestPrices) {
    const arr = byVariant.get(p.variant_id) || [];
    arr.push(p);
    byVariant.set(p.variant_id, arr);
  }

  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));

  interface EnrichedRow {
    kategoriGrupp: string; kategoriSort: number; kategori: string;
    varumärke: string; produkt: string; variant: string; färg: string;
    butik: string; egenButik: boolean; pris: number;
    ordinariePris: number | null; iLager: boolean; dittPris: number | null;
    lägstaPris: number | null; lägstaButik: string;
    prisskillnadKr: number | null; prisskillnadPct: string;
    antalButiker: number; url: string;
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
        kategoriGrupp, kategoriSort: catSort,
        kategori: CATEGORY_LABELS[category] || category,
        varumärke: product.brand, produkt: product.name,
        variant: variant.variant_name || '', färg: variant.color || '',
        butik: comp.name, egenButik: comp.is_own_store,
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

  const csvRows = rows.map(r => [
    date, r.kategoriGrupp, r.kategori, r.varumärke, r.produkt, r.variant, r.färg,
    r.butik, r.egenButik ? 'Ja' : 'Nej', r.pris, r.ordinariePris ?? '',
    r.ordinariePris && r.ordinariePris > r.pris ? 'Ja' : '', r.iLager ? 'Ja' : 'Nej',
    r.dittPris ?? '', r.lägstaPris ?? '', r.lägstaButik,
    r.prisskillnadKr ?? '', r.prisskillnadPct, r.antalButiker, r.url,
  ]);

  return [
    headers.join(';'),
    ...csvRows.map(row => row.map(escape).join(';')),
  ].join('\n');
}

// ── Format 2: Produktmatris (pivot — one row per product, one column per store) ──
export function buildMatrixCSV(
  prices: PriceRow[],
  products: ProductRow[],
  variants: VariantRow[],
  competitors: CompetitorRow[],
): string {
  const productMap = new Map(products.map(p => [p.id, p]));
  const variantMap = new Map(variants.map(v => [v.id, v]));
  const competitorMap = new Map(competitors.map(c => [c.id, c]));
  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));

  // Deduplicate: latest price per variant+competitor
  const seen = new Set<string>();
  const latestPrices = prices.filter(p => {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Get all active competitor names (own stores first)
  const storeNames = competitors
    .sort((a, b) => (a.is_own_store === b.is_own_store ? 0 : a.is_own_store ? -1 : 1))
    .map(c => c.name);

  // Group by product (aggregate variants — use cheapest price per store)
  const productPrices = new Map<string, Map<string, { price: number; inStock: boolean }>>();

  for (const p of latestPrices) {
    const variant = variantMap.get(p.variant_id);
    if (!variant) continue;
    const productId = variant.product_id;
    const comp = competitorMap.get(p.competitor_id);
    if (!comp) continue;

    if (!productPrices.has(productId)) productPrices.set(productId, new Map());
    const storeMap = productPrices.get(productId)!;
    const existing = storeMap.get(comp.name);
    if (!existing || p.price < existing.price) {
      storeMap.set(comp.name, { price: p.price, inStock: p.in_stock });
    }
  }

  interface MatrixRow {
    kategoriSort: number;
    kategori: string;
    varumärke: string;
    produkt: string;
    storePrices: Map<string, { price: number; inStock: boolean }>;
    billigast: string;
    billigastPris: number;
    dittPris: number | null;
    diffKr: number | null;
    diffPct: string;
  }

  const rows: MatrixRow[] = [];

  for (const [productId, storeMap] of productPrices) {
    const product = productMap.get(productId);
    if (!product) continue;

    const catSort = CATEGORY_SORT[product.category] ?? 99;
    const kategori = CATEGORY_LABELS[product.category] || product.category;

    // Find own price and cheapest overall
    let dittPris: number | null = null;
    let billigastPris = Infinity;
    let billigast = '';

    for (const [store, info] of storeMap) {
      const compEntry = competitors.find(c => c.name === store);
      if (compEntry && ownStoreIds.has(compEntry.id)) {
        if (dittPris === null || info.price < dittPris) dittPris = info.price;
      }
      if (info.price < billigastPris) {
        billigastPris = info.price;
        billigast = store;
      }
    }

    let diffKr: number | null = null;
    let diffPct = '';
    if (dittPris !== null && billigastPris < Infinity) {
      diffKr = dittPris - billigastPris;
      const pct = billigastPris > 0 ? ((dittPris - billigastPris) / billigastPris) * 100 : 0;
      diffPct = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }

    rows.push({
      kategoriSort: catSort, kategori, varumärke: product.brand,
      produkt: product.name, storePrices: storeMap,
      billigast, billigastPris: billigastPris === Infinity ? 0 : billigastPris,
      dittPris, diffKr, diffPct,
    });
  }

  rows.sort((a, b) => {
    if (a.kategoriSort !== b.kategoriSort) return a.kategoriSort - b.kategoriSort;
    if (a.varumärke !== b.varumärke) return a.varumärke.localeCompare(b.varumärke, 'sv');
    return a.produkt.localeCompare(b.produkt, 'sv');
  });

  const headers = [
    'Kategori', 'Varumärke', 'Produkt',
    ...storeNames,
    'Billigast', 'Diff vs dig (SEK)', 'Diff vs dig (%)',
  ];

  const csvRows = rows.map(r => [
    r.kategori, r.varumärke, r.produkt,
    ...storeNames.map(s => {
      const info = r.storePrices.get(s);
      if (!info) return '';
      return info.inStock ? info.price : `${info.price} (slut)`;
    }),
    r.billigast, r.diffKr ?? '', r.diffPct,
  ]);

  return [
    headers.join(';'),
    ...csvRows.map(row => row.map(escape).join(';')),
  ].join('\n');
}

// ── Format 3: Prishistorik (alla prisändringar per produkt+butik) ──
export function buildHistoryCSV(
  prices: PriceRow[],
  products: ProductRow[],
  variants: VariantRow[],
  competitors: CompetitorRow[],
): string {
  const productMap = new Map(products.map(p => [p.id, p]));
  const variantMap = new Map(variants.map(v => [v.id, v]));
  const competitorMap = new Map(competitors.map(c => [c.id, c]));

  // Group all prices by product+store, sorted by date
  const grouped = new Map<string, Array<{
    produkt: string; varumärke: string; kategori: string; kategoriSort: number;
    butik: string; egenButik: boolean; pris: number; datum: string;
  }>>();

  for (const p of prices) {
    const variant = variantMap.get(p.variant_id);
    if (!variant) continue;
    const product = productMap.get(variant.product_id);
    if (!product) continue;
    const comp = competitorMap.get(p.competitor_id);
    if (!comp) continue;

    const key = `${product.id}:${comp.id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      produkt: product.name, varumärke: product.brand,
      kategori: CATEGORY_LABELS[product.category] || product.category,
      kategoriSort: CATEGORY_SORT[product.category] ?? 99,
      butik: comp.name, egenButik: comp.is_own_store,
      pris: p.price, datum: p.scraped_at.slice(0, 10),
    });
  }

  interface HistoryRow {
    kategoriSort: number; kategori: string; varumärke: string; produkt: string;
    butik: string; egenButik: boolean; datum: string; pris: number;
    förändring: number | null; trend: string;
  }

  const rows: HistoryRow[] = [];

  for (const entries of grouped.values()) {
    // Sort by date, deduplicate per date (keep latest)
    entries.sort((a, b) => a.datum.localeCompare(b.datum));
    const byDate = new Map<string, typeof entries[0]>();
    for (const e of entries) byDate.set(e.datum, e);
    const unique = [...byDate.values()];

    // Only include entries where price changed (or first entry)
    let prevPrice: number | null = null;
    let consecutiveDrops = 0;
    let consecutiveRaises = 0;

    for (const e of unique) {
      let förändring: number | null = null;
      let trend = '';

      if (prevPrice !== null && e.pris !== prevPrice) {
        förändring = e.pris - prevPrice;
        if (förändring < 0) {
          consecutiveDrops++;
          consecutiveRaises = 0;
          trend = consecutiveDrops >= 3 ? '↓↓↓' : consecutiveDrops >= 2 ? '↓↓' : '↓';
        } else {
          consecutiveRaises++;
          consecutiveDrops = 0;
          trend = consecutiveRaises >= 3 ? '↑↑↑' : consecutiveRaises >= 2 ? '↑↑' : '↑';
        }

        rows.push({
          kategoriSort: e.kategoriSort, kategori: e.kategori,
          varumärke: e.varumärke, produkt: e.produkt,
          butik: e.butik, egenButik: e.egenButik,
          datum: e.datum, pris: e.pris, förändring, trend,
        });
      } else if (prevPrice === null) {
        // First entry for this product+store
        rows.push({
          kategoriSort: e.kategoriSort, kategori: e.kategori,
          varumärke: e.varumärke, produkt: e.produkt,
          butik: e.butik, egenButik: e.egenButik,
          datum: e.datum, pris: e.pris, förändring: null, trend: '',
        });
      }

      prevPrice = e.pris;
    }
  }

  rows.sort((a, b) => {
    if (a.kategoriSort !== b.kategoriSort) return a.kategoriSort - b.kategoriSort;
    if (a.varumärke !== b.varumärke) return a.varumärke.localeCompare(b.varumärke, 'sv');
    if (a.produkt !== b.produkt) return a.produkt.localeCompare(b.produkt, 'sv');
    if (a.butik !== b.butik) return a.butik.localeCompare(b.butik, 'sv');
    return a.datum.localeCompare(b.datum);
  });

  const headers = [
    'Kategori', 'Varumärke', 'Produkt', 'Butik', 'Egen butik',
    'Datum', 'Pris (SEK)', 'Förändring (SEK)', 'Trend',
  ];

  const csvRows = rows.map(r => [
    r.kategori, r.varumärke, r.produkt, r.butik,
    r.egenButik ? 'Ja' : 'Nej', r.datum, r.pris,
    r.förändring ?? '', r.trend,
  ]);

  return [
    headers.join(';'),
    ...csvRows.map(row => row.map(escape).join(';')),
  ].join('\n');
}

// ── Format 4: Konkurrentanalys (summary per competitor) ──
export function buildCompetitorCSV(
  prices: PriceRow[],
  products: ProductRow[],
  variants: VariantRow[],
  competitors: CompetitorRow[],
): string {
  const productMap = new Map(products.map(p => [p.id, p]));
  const variantMap = new Map(variants.map(v => [v.id, v]));
  const competitorMap = new Map(competitors.map(c => [c.id, c]));
  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));

  // Deduplicate
  const seen = new Set<string>();
  const latestPrices = prices.filter(p => {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build own-price map (cheapest own price per product)
  const ownPriceByProduct = new Map<string, number>();
  for (const p of latestPrices) {
    if (!ownStoreIds.has(p.competitor_id)) continue;
    const variant = variantMap.get(p.variant_id);
    if (!variant) continue;
    const existing = ownPriceByProduct.get(variant.product_id);
    if (!existing || p.price < existing) ownPriceByProduct.set(variant.product_id, p.price);
  }

  // Analyze per competitor
  const competitorNonOwn = competitors.filter(c => !c.is_own_store);

  interface CompAnalysis {
    butik: string;
    antalProdukter: number;
    gemensamma: number;
    billigare: number;
    dyrare: number;
    lika: number;
    snittDiffPct: number;
    prisändringar30d: number;
    sänkningar30d: number;
    höjningar30d: number;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows: CompAnalysis[] = [];

  for (const comp of competitorNonOwn) {
    const compPrices = latestPrices.filter(p => p.competitor_id === comp.id);
    const productIds = new Set<string>();
    let billigare = 0, dyrare = 0, lika = 0;
    const diffs: number[] = [];

    for (const p of compPrices) {
      const variant = variantMap.get(p.variant_id);
      if (!variant) continue;
      productIds.add(variant.product_id);

      const ownPrice = ownPriceByProduct.get(variant.product_id);
      if (ownPrice === undefined) continue;

      const diff = p.price - ownPrice;
      const pct = ownPrice > 0 ? (diff / ownPrice) * 100 : 0;
      diffs.push(pct);

      if (diff < -10) billigare++;
      else if (diff > 10) dyrare++;
      else lika++;
    }

    // Count price changes in last 30 days
    const allCompPrices = prices.filter(p => p.competitor_id === comp.id);
    const byVariantStore = new Map<string, Array<{ price: number; date: string }>>();
    for (const p of allCompPrices) {
      if (new Date(p.scraped_at) < thirtyDaysAgo) continue;
      if (!byVariantStore.has(p.variant_id)) byVariantStore.set(p.variant_id, []);
      byVariantStore.get(p.variant_id)!.push({ price: p.price, date: p.scraped_at });
    }

    let sänkningar = 0, höjningar = 0;
    for (const history of byVariantStore.values()) {
      history.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < history.length; i++) {
        if (history[i].price < history[i - 1].price) sänkningar++;
        else if (history[i].price > history[i - 1].price) höjningar++;
      }
    }

    const snittDiff = diffs.length > 0
      ? diffs.reduce((a, b) => a + b, 0) / diffs.length
      : 0;

    rows.push({
      butik: comp.name,
      antalProdukter: productIds.size,
      gemensamma: diffs.length,
      billigare, dyrare, lika,
      snittDiffPct: snittDiff,
      prisändringar30d: sänkningar + höjningar,
      sänkningar30d: sänkningar,
      höjningar30d: höjningar,
    });
  }

  rows.sort((a, b) => a.butik.localeCompare(b.butik, 'sv'));

  const headers = [
    'Konkurrent', 'Antal produkter', 'Gemensamma produkter',
    'De är billigare', 'De är dyrare', 'Lika pris',
    'Snitt prisskillnad (%)', 'Prisändringar 30d',
    'Sänkningar 30d', 'Höjningar 30d',
  ];

  const csvRows = rows.map(r => [
    r.butik, r.antalProdukter, r.gemensamma,
    r.billigare, r.dyrare, r.lika,
    `${r.snittDiffPct >= 0 ? '+' : ''}${r.snittDiffPct.toFixed(1)}%`,
    r.prisändringar30d, r.sänkningar30d, r.höjningar30d,
  ]);

  return [
    headers.join(';'),
    ...csvRows.map(row => row.map(escape).join(';')),
  ].join('\n');
}

// ── Shared data fetcher ──
async function fetchExportData() {
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
  return {
    prices: (prices || []) as PriceRow[],
    products: (products || []) as ProductRow[],
    variants: (variants || []) as VariantRow[],
    competitors: (competitors || []) as CompetitorRow[],
  };
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type ExportFormat = 'dagsdata' | 'matris' | 'historik' | 'konkurrent';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  dagsdata: 'Dagsdata (alla priser)',
  matris: 'Produktmatris (jämför butiker)',
  historik: 'Prishistorik (trender)',
  konkurrent: 'Konkurrentanalys (sammanfattning)',
};

export function ExportButton() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleExport(format: ExportFormat) {
    setOpen(false);
    setLoading(true);
    try {
      const data = await fetchExportData();
      if (!data.prices.length) {
        alert('Ingen prisdata att exportera');
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      let csv: string;
      let filename: string;

      switch (format) {
        case 'dagsdata':
          csv = buildExportCSV(data.prices, data.products, data.variants, data.competitors, today);
          filename = `prisdata-${today}.csv`;
          break;
        case 'matris':
          csv = buildMatrixCSV(data.prices, data.products, data.variants, data.competitors);
          filename = `produktmatris-${today}.csv`;
          break;
        case 'historik':
          csv = buildHistoryCSV(data.prices, data.products, data.variants, data.competitors);
          filename = `prishistorik-${today}.csv`;
          break;
        case 'konkurrent':
          csv = buildCompetitorCSV(data.prices, data.products, data.variants, data.competitors);
          filename = `konkurrentanalys-${today}.csv`;
          break;
      }

      downloadCSV(csv, filename);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export misslyckades');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border border-zinc-100 text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
      >
        <span className="flex items-center gap-2">
          <Download className="h-3.5 w-3.5" />
          {loading ? 'Exporterar...' : 'Exportera data'}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1">
          {(Object.entries(FORMAT_LABELS) as [ExportFormat, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleExport(key)}
              className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
