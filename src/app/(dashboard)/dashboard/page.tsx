import { createClient } from '@/lib/supabase/server';
import { ProductPriceComparison } from '@/components/dashboard/price-charts';
import { ExportButton } from '@/components/dashboard/export-button';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();

  // ── Core queries ──
  const [productsRes, competitorsRes, priceDropsRes, priceIncreasesRes, recsRes, variantsRes] = await Promise.all([
    supabase.from('products').select('id, name, brand').eq('is_active', true),
    supabase.from('competitors').select('id, name, is_own_store, color').eq('is_active', true),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('type', 'PRICE_DROP').eq('is_read', false),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('type', 'PRICE_INCREASE').eq('is_read', false),
    supabase.from('price_recommendations').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('product_variants').select('id, product_id'),
  ]);

  const products = productsRes.data || [];
  const competitors = competitorsRes.data || [];
  const variants = variantsRes.data || [];
  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));
  const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));

  // ── All prices ──
  const { data: allPrices } = await supabase
    .from('product_prices')
    .select('variant_id, competitor_id, price, scraped_at, url')
    .order('scraped_at', { ascending: true });
  const prices = allPrices || [];

  // ── Product price comparison data ──
  // Group prices by product → competitor → date, and track URLs
  const productPriceMap = new Map<string, Map<string, Map<string, number>>>();
  const productUrlMap = new Map<string, Map<string, string>>(); // product → competitor → url
  for (const p of prices) {
    const productId = variantToProduct.get(p.variant_id);
    if (!productId) continue;
    if (!productPriceMap.has(productId)) productPriceMap.set(productId, new Map());
    const compMap = productPriceMap.get(productId)!;
    if (!compMap.has(p.competitor_id)) compMap.set(p.competitor_id, new Map());
    const dateMap = compMap.get(p.competitor_id)!;
    const date = p.scraped_at.slice(0, 10);
    dateMap.set(date, p.price);
    // Keep latest URL per product+competitor
    if (p.url) {
      if (!productUrlMap.has(productId)) productUrlMap.set(productId, new Map());
      productUrlMap.get(productId)!.set(p.competitor_id, p.url);
    }
  }

  // Only include products that have prices from 2+ competitors
  const comparisonProducts = products
    .filter(p => {
      const compMap = productPriceMap.get(p.id);
      return compMap && compMap.size >= 2;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    .map(p => ({ id: p.id, name: p.name, brand: p.brand }));

  // Build serializable price data: { [productId]: { [competitorId]: { [date]: price } } }
  const comparisonPrices: Record<string, Record<string, Record<string, number>>> = {};
  for (const prod of comparisonProducts) {
    const compMap = productPriceMap.get(prod.id);
    if (!compMap) continue;
    comparisonPrices[prod.id] = {};
    for (const [compId, dateMap] of compMap) {
      comparisonPrices[prod.id][compId] = Object.fromEntries(dateMap);
    }
  }

  // Build URL map: { [productId]: { [competitorId]: url } }
  const comparisonUrls: Record<string, Record<string, string>> = {};
  for (const prod of comparisonProducts) {
    const urlMap = productUrlMap.get(prod.id);
    if (!urlMap) continue;
    comparisonUrls[prod.id] = Object.fromEntries(urlMap);
  }

  const comparisonCompetitors = competitors
    .map(c => ({ id: c.id, name: c.name, isOwn: c.is_own_store, color: c.color }));

  // Price position
  const variantLatest = new Map<string, Map<string, number>>();
  for (const p of prices) {
    if (!variantLatest.has(p.variant_id)) variantLatest.set(p.variant_id, new Map());
    variantLatest.get(p.variant_id)!.set(p.competitor_id, p.price);
  }

  let cheapest = 0, mid = 0, expensive = 0;
  for (const [, compPrices] of variantLatest) {
    if (compPrices.size < 2) continue;
    let ourPrice: number | null = null;
    const theirs: number[] = [];
    for (const [cId, price] of compPrices) {
      if (ownStoreIds.has(cId)) ourPrice = price;
      else theirs.push(price);
    }
    if (ourPrice === null || theirs.length === 0) continue;
    if (ourPrice <= Math.min(...theirs)) cheapest++;
    else if (ourPrice >= Math.max(...theirs)) expensive++;
    else mid++;
  }
  const positioned = cheapest + mid + expensive;
  const cheapestPct = positioned > 0 ? Math.round((cheapest / positioned) * 100) : 0;

  const totalProducts = products.length;
  const drops = priceDropsRes.count || 0;
  const increases = priceIncreasesRes.count || 0;
  const recs = recsRes.count || 0;

  return (
    <div className="space-y-10">
      {/* ── Metrics ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-y-6">
        <MetricItem label="Produkter" value={totalProducts} href="/products" />
        <MetricItem label="Billigast på" value={`${cheapestPct}%`} sub={`${cheapest} av ${positioned}`} />
        <MetricItem label="Dyrast på" value={`${positioned > 0 ? Math.round((expensive / positioned) * 100) : 0}%`} sub={`${expensive} av ${positioned}`} />
        <MetricItem label="Prissänkningar" value={drops} href="/alerts" dot="emerald" />
        <MetricItem label="Prishöjningar" value={increases} href="/alerts" dot="red" />
        <MetricItem label="Åtgärder" value={recs} href="/recommendations" dot={recs > 0 ? 'amber' : undefined} />
      </div>

      {/* ── Position bar ── */}
      {positioned > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Prisposition</p>
            <div className="flex gap-4 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Billigast</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-200" />Mellanpris</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />Dyrast</span>
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-zinc-100">
            {cheapest > 0 && <div className="bg-emerald-500" style={{ width: `${(cheapest / positioned) * 100}%` }} />}
            {mid > 0 && <div className="bg-zinc-200" style={{ width: `${(mid / positioned) * 100}%` }} />}
            {expensive > 0 && <div className="bg-red-400" style={{ width: `${(expensive / positioned) * 100}%` }} />}
          </div>
        </div>
      )}

      {/* ── Export ── */}
      <div className="flex justify-end">
        <ExportButton />
      </div>

      {/* ── Product Price Comparison ── */}
      <ProductPriceComparison
        products={comparisonProducts}
        competitors={comparisonCompetitors}
        prices={comparisonPrices}
        urls={comparisonUrls}
      />

    </div>
  );
}

function MetricItem({
  label, value, sub, href, dot,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
  dot?: 'emerald' | 'red' | 'amber';
}) {
  const dotColor = dot === 'emerald' ? 'bg-emerald-500' : dot === 'red' ? 'bg-red-500' : dot === 'amber' ? 'bg-amber-500' : null;

  const inner = (
    <div className={href ? 'cursor-pointer group' : ''}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {dotColor && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
        <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium group-hover:text-zinc-600 transition-colors">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-xs text-zinc-400">{sub}</span>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
