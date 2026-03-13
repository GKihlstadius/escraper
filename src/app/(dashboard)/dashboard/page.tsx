import { createClient } from '@/lib/supabase/server';
import { ProductPriceComparison } from '@/components/dashboard/price-charts';
import { ExportButton } from '@/components/dashboard/export-button';
import Link from 'next/link';
import {
  ArrowUp, Package, TrendingDown, TrendingUp,
  Lightbulb, BarChart3, Activity,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  // ── Core queries ──
  const [productsRes, competitorsRes, priceDropsRes, priceIncreasesRes, recsRes, variantsRes, lastScrapeRes] = await Promise.all([
    supabase.from('products').select('id, name, brand').eq('is_active', true),
    supabase.from('competitors').select('id, name, is_own_store, color').eq('is_active', true),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('type', 'PRICE_DROP').eq('is_read', false),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('type', 'PRICE_INCREASE').eq('is_read', false),
    supabase.from('price_recommendations').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('product_variants').select('id, product_id'),
    supabase.from('scraping_logs').select('created_at, status, products_scraped').order('created_at', { ascending: false }).limit(1),
  ]);

  const products = productsRes.data || [];
  const competitors = competitorsRes.data || [];
  const variants = variantsRes.data || [];
  const lastScrape = lastScrapeRes.data?.[0] || null;
  const ownStoreIds = new Set(competitors.filter(c => c.is_own_store).map(c => c.id));
  const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));

  // ── All prices ──
  const { data: allPrices } = await supabase
    .from('product_prices')
    .select('variant_id, competitor_id, price, scraped_at, url')
    .order('scraped_at', { ascending: true });
  const prices = allPrices || [];

  // ── Product price comparison data ──
  const productPriceMap = new Map<string, Map<string, Map<string, number>>>();
  const productUrlMap = new Map<string, Map<string, string>>();
  for (const p of prices) {
    const productId = variantToProduct.get(p.variant_id);
    if (!productId) continue;
    if (!productPriceMap.has(productId)) productPriceMap.set(productId, new Map());
    const compMap = productPriceMap.get(productId)!;
    if (!compMap.has(p.competitor_id)) compMap.set(p.competitor_id, new Map());
    const dateMap = compMap.get(p.competitor_id)!;
    const date = p.scraped_at.slice(0, 10);
    dateMap.set(date, p.price);
    if (p.url) {
      if (!productUrlMap.has(productId)) productUrlMap.set(productId, new Map());
      productUrlMap.get(productId)!.set(p.competitor_id, p.url);
    }
  }

  // Include ALL products with any price data
  const comparisonProducts = products
    .filter(p => productPriceMap.has(p.id))
    .sort((a, b) => {
      // Products with more competitors first
      const aSize = productPriceMap.get(a.id)?.size || 0;
      const bSize = productPriceMap.get(b.id)?.size || 0;
      if (bSize !== aSize) return bSize - aSize;
      return a.name.localeCompare(b.name, 'sv');
    })
    .map(p => ({ id: p.id, name: p.name, brand: p.brand, storeCount: productPriceMap.get(p.id)?.size || 0 }));

  const comparisonPrices: Record<string, Record<string, Record<string, number>>> = {};
  for (const prod of comparisonProducts) {
    const compMap = productPriceMap.get(prod.id);
    if (!compMap) continue;
    comparisonPrices[prod.id] = {};
    for (const [compId, dateMap] of compMap) {
      comparisonPrices[prod.id][compId] = Object.fromEntries(dateMap);
    }
  }

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
  const expensivePct = positioned > 0 ? Math.round((expensive / positioned) * 100) : 0;

  const totalProducts = products.length;
  const drops = priceDropsRes.count || 0;
  const increases = priceIncreasesRes.count || 0;
  const recs = recsRes.count || 0;

  const TYPE_ICONS: Record<string, string> = {
    PRICE_DROP: 'emerald',
    PRICE_INCREASE: 'red',
    STOCK_CHANGE: 'blue',
    NEW_CAMPAIGN: 'amber',
  };

  return (
    <div className="space-y-8">
      {/* ── Status bar ── */}
      {lastScrape && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Activity className="h-3 w-3" />
          <span>
            Senaste scrape: {new Date(lastScrape.created_at).toLocaleString('sv-SE')}
            {lastScrape.status === 'SUCCESS' && ` — ${lastScrape.products_scraped} produkter`}
          </span>
          <span className={`h-1.5 w-1.5 rounded-full ${lastScrape.status === 'SUCCESS' ? 'bg-emerald-400' : lastScrape.status === 'RUNNING' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Produkter"
          value={totalProducts}
          icon={<Package className="h-4 w-4" />}
          href="/products"
          subtitle={`${competitors.filter(c => !c.is_own_store).length} konkurrenter`}
        />
        <KpiCard
          title="Prisposition"
          value={`${cheapestPct}%`}
          icon={<BarChart3 className="h-4 w-4" />}
          subtitle={`Billigast på ${cheapest} av ${positioned}`}
          accent={cheapestPct >= 50 ? 'emerald' : cheapestPct >= 30 ? 'amber' : 'red'}
        />
        <KpiCard
          title="Prissänkningar"
          value={drops}
          icon={<TrendingDown className="h-4 w-4" />}
          href="/alerts"
          accent="emerald"
          subtitle="Olästa larm"
        />
        <KpiCard
          title="Prishöjningar"
          value={increases}
          icon={<TrendingUp className="h-4 w-4" />}
          href="/alerts"
          accent="red"
          subtitle="Olästa larm"
        />
      </div>

      {/* ── Position bar + Actions row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Position bar */}
        {positioned > 0 && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-100 p-3 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <h3 className="text-sm font-medium text-zinc-900">Prisposition</h3>
              <div className="flex gap-3 sm:gap-4 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Billigast</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-zinc-200" />Mellan</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Dyrast</span>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-zinc-50">
              {cheapest > 0 && <div className="bg-emerald-500 rounded-l-full transition-all" style={{ width: `${(cheapest / positioned) * 100}%` }} />}
              {mid > 0 && <div className="bg-zinc-200 transition-all" style={{ width: `${(mid / positioned) * 100}%` }} />}
              {expensive > 0 && <div className="bg-red-400 rounded-r-full transition-all" style={{ width: `${(expensive / positioned) * 100}%` }} />}
            </div>
            <div className="flex justify-between mt-3 text-xs text-zinc-400">
              <span>{cheapest} produkter</span>
              <span>{mid} produkter</span>
              <span>{expensive} produkter</span>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-zinc-100 p-3 sm:p-5 flex flex-col justify-between">
          <h3 className="text-sm font-medium text-zinc-900 mb-3">Snabblänkar</h3>
          <div className="space-y-2">
            {recs > 0 && (
              <Link
                href="/recommendations"
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-sm hover:bg-amber-100 transition-colors"
              >
                <span className="flex items-center gap-2 text-amber-700">
                  <Lightbulb className="h-3.5 w-3.5" />
                  {recs} åtgärdsförslag
                </span>
                <ArrowUp className="h-3 w-3 text-amber-500 rotate-90" />
              </Link>
            )}
            <ExportButton />
          </div>
        </div>
      </div>

      {/* ── Product Price Comparison ── */}
      <div className="bg-white rounded-xl border border-zinc-100 p-3 sm:p-5">
        <ProductPriceComparison
          products={comparisonProducts}
          competitors={comparisonCompetitors}
          prices={comparisonPrices}
          urls={comparisonUrls}
        />
      </div>
    </div>
  );
}

function KpiCard({
  title, value, subtitle, icon, href, accent,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  href?: string;
  accent?: 'emerald' | 'red' | 'amber';
}) {
  const accentBorder = accent === 'emerald' ? 'border-l-emerald-500'
    : accent === 'red' ? 'border-l-red-400'
    : accent === 'amber' ? 'border-l-amber-400'
    : 'border-l-transparent';

  const inner = (
    <div className={`bg-white rounded-xl border border-zinc-100 border-l-[3px] ${accentBorder} p-3 sm:p-5 ${href ? 'hover:shadow-md hover:border-zinc-200 transition-all cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className="text-[10px] sm:text-xs text-zinc-400 uppercase tracking-wider font-medium">{title}</span>
        <span className="text-zinc-300">{icon}</span>
      </div>
      <div className="text-xl sm:text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
      {subtitle && <p className="text-[10px] sm:text-xs text-zinc-400 mt-1">{subtitle}</p>}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
