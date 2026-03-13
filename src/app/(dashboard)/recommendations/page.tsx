import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight, TrendingDown, TrendingUp, Minus, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PriceDiff {
  productId: string;
  productName: string;
  brand: string;
  ownStoreName: string;
  ownPrice: number;
  competitorName: string;
  competitorPrice: number;
  diff: number;
  diffPct: number;
  url: string | null;
}

export default async function RecommendationsPage() {
  const supabase = await createClient();

  const [productsRes, competitorsRes, variantsRes] = await Promise.all([
    supabase.from('products').select('id, name, brand').eq('is_active', true),
    supabase.from('competitors').select('id, name, is_own_store').eq('is_active', true),
    supabase.from('product_variants').select('id, product_id'),
  ]);

  const products = productsRes.data || [];
  const competitors = competitorsRes.data || [];
  const variants = variantsRes.data || [];

  const productMap = new Map(products.map(p => [p.id, p]));
  const compMap = new Map(competitors.map(c => [c.id, c]));
  const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));
  const ownStores = competitors.filter(c => c.is_own_store);
  const ownStoreIds = new Set(ownStores.map(c => c.id));

  // Get latest prices per variant+competitor
  const { data: allPrices } = await supabase
    .from('product_prices')
    .select('variant_id, competitor_id, price, url')
    .order('scraped_at', { ascending: false });

  // Keep only latest price per variant+competitor
  const latestPrices = new Map<string, { price: number; url: string | null }>();
  for (const p of allPrices || []) {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (!latestPrices.has(key)) {
      latestPrices.set(key, { price: p.price, url: p.url });
    }
  }

  // Build price diffs: for each product, compare own price vs each competitor
  const diffs: PriceDiff[] = [];

  for (const variant of variants) {
    const product = productMap.get(variant.product_id);
    if (!product) continue;

    // Get own store prices for this variant
    const ownPrices: { storeName: string; price: number }[] = [];
    for (const ownStore of ownStores) {
      const key = `${variant.id}:${ownStore.id}`;
      const entry = latestPrices.get(key);
      if (entry && entry.price > 0) {
        ownPrices.push({ storeName: ownStore.name, price: entry.price });
      }
    }

    if (ownPrices.length === 0) continue;

    // Compare against each competitor
    for (const [key, entry] of latestPrices) {
      if (!key.startsWith(variant.id + ':')) continue;
      const compId = key.split(':')[1];
      if (ownStoreIds.has(compId)) continue;
      if (entry.price <= 0) continue;

      const comp = compMap.get(compId);
      if (!comp) continue;

      // Use the first own store price for comparison
      for (const own of ownPrices) {
        const diff = own.price - entry.price;
        if (Math.abs(diff) < 1) continue; // Skip if essentially same price

        diffs.push({
          productId: product.id,
          productName: product.name,
          brand: product.brand,
          ownStoreName: own.storeName,
          ownPrice: own.price,
          competitorName: comp.name,
          competitorPrice: entry.price,
          diff,
          diffPct: (diff / own.price) * 100,
          url: entry.url,
        });
      }
    }
  }

  // Sort: biggest price difference first (we're more expensive)
  diffs.sort((a, b) => b.diff - a.diff);

  // Deduplicate by product+competitor (keep worst diff per product)
  const seen = new Set<string>();
  const uniqueDiffs = diffs.filter(d => {
    const key = `${d.productId}:${d.competitorName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const moreExpensive = uniqueDiffs.filter(d => d.diff > 0);
  const cheaper = uniqueDiffs.filter(d => d.diff < 0).sort((a, b) => a.diff - b.diff);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Prisrekommendationer</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Prisskillnader mellan era butiker och konkurrenter
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-zinc-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-red-500" />
            <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Dyrare än konkurrent</span>
          </div>
          <div className="text-2xl font-semibold text-zinc-900">{moreExpensive.length}</div>
          <p className="text-xs text-zinc-400 mt-0.5">produkter</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Billigare än konkurrent</span>
          </div>
          <div className="text-2xl font-semibold text-zinc-900">{cheaper.length}</div>
          <p className="text-xs text-zinc-400 mt-0.5">produkter</p>
        </div>
      </div>

      {/* More expensive — action needed */}
      {moreExpensive.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-red-500" />
            Ni är dyrare — överväg prissänkning
          </h2>
          <div className="space-y-2">
            {moreExpensive.map((d, i) => (
              <PriceDiffRow key={i} diff={d} type="expensive" />
            ))}
          </div>
        </div>
      )}

      {/* Cheaper — for info */}
      {cheaper.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-emerald-500" />
            Ni är billigare
          </h2>
          <div className="space-y-2">
            {cheaper.map((d, i) => (
              <PriceDiffRow key={i} diff={d} type="cheaper" />
            ))}
          </div>
        </div>
      )}

      {uniqueDiffs.length === 0 && (
        <div className="text-center py-12 text-zinc-400">
          Inga prisskillnader hittade. Kör en scraping för att hämta prisdata.
        </div>
      )}
    </div>
  );
}

function PriceDiffRow({ diff: d, type }: { diff: PriceDiff; type: 'expensive' | 'cheaper' }) {
  const absDiff = Math.abs(d.diff);
  const absPct = Math.abs(d.diffPct);

  return (
    <Link href={`/products/${d.productId}`}>
      <div className="bg-white rounded-xl border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          {/* Product info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-zinc-900 truncate">{d.productName}</p>
            <p className="text-xs text-zinc-400">{d.brand}</p>
          </div>

          {/* Price comparison */}
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            <div className="text-right">
              <p className="text-[10px] text-zinc-400">{d.ownStoreName}</p>
              <p className="font-medium text-zinc-900">{d.ownPrice.toLocaleString('sv-SE')} kr</p>
            </div>
            <ArrowRight className="h-3 w-3 text-zinc-300 shrink-0" />
            <div className="text-right">
              <p className="text-[10px] text-zinc-400">{d.competitorName}</p>
              <p className="font-medium text-zinc-900">{d.competitorPrice.toLocaleString('sv-SE')} kr</p>
            </div>
          </div>

          {/* Diff badge */}
          <div className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium ${
            type === 'expensive'
              ? 'bg-red-50 text-red-600 border border-red-100'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
          }`}>
            {type === 'expensive' ? '+' : '-'}{absDiff.toLocaleString('sv-SE')} kr ({absPct.toFixed(0)}%)
          </div>

          {/* External link */}
          {d.url && (
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-zinc-300 hover:text-zinc-500 transition-colors shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </Link>
  );
}
