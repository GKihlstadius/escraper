import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight, TrendingDown, TrendingUp, ExternalLink, Clock } from 'lucide-react';

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
  scrapedAt: string;
}

// Detect if a product name vs competitor URL is a likely mismatch
// e.g., product "Cybex PRIAM Skidor" matched to URL "cybex-priam-duovagn"
function isLikelyMismatch(productName: string, url: string): boolean {
  const name = productName.toLowerCase();
  const urlPath = url.toLowerCase();

  // Part/accessory keywords
  const partKeywords = ['liggdel', 'sittdel', 'chassi', 'chassis', 'suflett', 'adapter',
    'fotsack', 'regnskydd', 'skidor', 'varukorg', 'hjul', 'körkåpa', 'solskydd',
    'insektsnät', 'åkpåse', 'mugghållare', 'cupholder', 'organiser', 'barsele',
    'madrass', 'kudde', 'handtag', 'bumper', 'snack-tray'];
  // Full product keywords
  const fullProductKeywords = ['duovagn', 'sittvagn', 'kombivagn', 'barnvagn', 'syskonvagn'];
  // Bundle keywords
  const bundleKeywords = ['paket', 'komplett', 'set', 'bundle', 'inkl'];

  const nameIsPart = partKeywords.some(k => name.includes(k));
  const nameIsFullProduct = fullProductKeywords.some(k => name.includes(k));
  const nameIsBundle = bundleKeywords.some(k => name.includes(k));

  const urlHasPart = partKeywords.some(k => urlPath.includes(k));
  const urlHasFullProduct = fullProductKeywords.some(k => urlPath.includes(k));
  const urlHasBundle = bundleKeywords.some(k => urlPath.includes(k));

  // Part matched to full product or bundle
  if (nameIsPart && (urlHasFullProduct || urlHasBundle)) return true;
  // Full product matched to part
  if (nameIsFullProduct && urlHasPart) return true;
  // Bundle matched to non-bundle, or vice versa
  if (nameIsBundle && !urlHasBundle && urlHasFullProduct) return true;
  // Sittvagn vs duovagn mismatch
  if (name.includes('sittvagn') && urlPath.includes('duovagn')) return true;
  if (name.includes('duovagn') && urlPath.includes('sittvagn') && !urlPath.includes('duovagn')) return true;
  // Babyskydd matched to babyskydd+bas bundle
  if (name.includes('babyskydd') && !name.includes('bas') && !name.includes('inkl') &&
      urlPath.includes('babyskydd') && (urlPath.includes('-bas') || urlPath.includes('inkl'))) return true;
  // Bilstol matched to bilstol+bas bundle
  if (name.includes('bilbarnstol') && !name.includes('bas') && !name.includes('inkl') &&
      urlPath.includes('inkl') && urlPath.includes('bas')) return true;

  return false;
}

export default async function RecommendationsPage() {
  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    console.error('[recommendations] Failed to create supabase client:', e);
    throw new Error('Failed to initialize database connection');
  }

  // Only consider prices from the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  const [productsRes, competitorsRes, variantsRes] = await Promise.all([
    supabase.from('products').select('id, name, brand').eq('is_active', true),
    supabase.from('competitors').select('id, name, is_own_store').eq('is_active', true),
    supabase.from('product_variants').select('id, product_id'),
  ]);

  if (productsRes.error) {
    console.error('[recommendations] products query error:', productsRes.error);
    throw new Error(`Products query failed: ${productsRes.error.message}`);
  }
  if (competitorsRes.error) {
    console.error('[recommendations] competitors query error:', competitorsRes.error);
    throw new Error(`Competitors query failed: ${competitorsRes.error.message}`);
  }
  if (variantsRes.error) {
    console.error('[recommendations] variants query error:', variantsRes.error);
    throw new Error(`Variants query failed: ${variantsRes.error.message}`);
  }

  const products = productsRes.data || [];
  const competitors = competitorsRes.data || [];
  const variants = variantsRes.data || [];

  const productMap = new Map(products.map(p => [p.id, p]));
  const compMap = new Map(competitors.map(c => [c.id, c]));
  const ownStores = competitors.filter(c => c.is_own_store);
  const ownStoreIds = new Set(ownStores.map(c => c.id));

  // Get latest prices - only from last 30 days
  let allPrices: { variant_id: string; competitor_id: string; price: number; url: string | null; scraped_at: string }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('product_prices')
      .select('variant_id, competitor_id, price, url, scraped_at')
      .gte('scraped_at', cutoff)
      .order('scraped_at', { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allPrices = allPrices.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`[recommendations] Loaded ${allPrices.length} prices, ${products.length} products, ${variants.length} variants`);

  // Keep only latest price per variant+competitor, grouped by variant_id
  const latestByKey = new Map<string, { price: number; url: string | null; scraped_at: string }>();
  for (const p of allPrices) {
    const key = `${p.variant_id}:${p.competitor_id}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, { price: p.price, url: p.url, scraped_at: p.scraped_at });
    }
  }

  // Group by variant_id for O(1) lookup
  const pricesByVariant = new Map<string, Map<string, { price: number; url: string | null; scraped_at: string }>>();
  for (const [key, entry] of latestByKey) {
    const [variantId, compId] = key.split(':');
    if (!pricesByVariant.has(variantId)) pricesByVariant.set(variantId, new Map());
    pricesByVariant.get(variantId)!.set(compId, entry);
  }

  // Build price diffs
  const diffs: PriceDiff[] = [];

  for (const variant of variants) {
    const product = productMap.get(variant.product_id);
    if (!product) continue;

    const variantPrices = pricesByVariant.get(variant.id);
    if (!variantPrices) continue;

    // Get own store prices for this variant
    const ownPrices: { storeName: string; price: number }[] = [];
    for (const ownStore of ownStores) {
      const entry = variantPrices.get(ownStore.id);
      if (entry && entry.price > 0) {
        ownPrices.push({ storeName: ownStore.name, price: entry.price });
      }
    }

    if (ownPrices.length === 0) continue;

    // Compare against each competitor for this variant
    for (const [compId, entry] of variantPrices) {
      if (ownStoreIds.has(compId)) continue;
      if (entry.price <= 0) continue;

      const comp = compMap.get(compId);
      if (!comp) continue;

      for (const own of ownPrices) {
        // Price sanity check
        const ratio = entry.price / own.price;
        if (ratio > 3 || ratio < 0.33) continue;

        // Product type mismatch check — compare product name vs competitor URL
        if (entry.url && isLikelyMismatch(product.name, entry.url)) continue;

        const diff = own.price - entry.price;
        if (Math.abs(diff) < 1) continue;

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
          scrapedAt: entry.scraped_at,
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
          Prisskillnader mellan era butiker och konkurrenter (senaste 30 dagarna)
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
  const scrapedDate = new Date(d.scrapedAt);
  const daysAgo = Math.floor((Date.now() - scrapedDate.getTime()) / 86400000);
  const freshness = daysAgo === 0 ? 'Idag' : daysAgo === 1 ? 'Igår' : `${daysAgo} dagar sedan`;
  const isStale = daysAgo > 14;

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

          {/* Freshness indicator */}
          <div className={`shrink-0 flex items-center gap-1 text-[10px] ${isStale ? 'text-amber-500' : 'text-zinc-400'}`} title={`Pris hämtat: ${scrapedDate.toLocaleDateString('sv-SE')}`}>
            <Clock className="h-3 w-3" />
            {freshness}
          </div>

          {/* External link */}
          {d.url && (
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
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
