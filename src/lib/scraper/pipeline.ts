// Scraping pipeline: discover → fetch → parse → save
import { createClient } from '@supabase/supabase-js';
import { discoverProductUrls, discoverFromCategoryPages } from './sitemap';
import { renderPage } from './cloudflare';
import { parseProductPage, normalizeName, extractModelName, extractModelKey, normalizeBrand, tokenOverlapScore, areTypesCompatible, type ParsedProduct } from './parser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseServiceClient = any;

function getServiceClient(): SupabaseServiceClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ScrapeResult {
  competitorId: string;
  competitorName: string;
  productsScraped: number;
  newPrices: number;
  alerts: number;
  errors: string[];
  totalUrls: number;
  urlsProcessed: number;
  nextOffset: number;
  hasMore: boolean;
}

export async function scrapeCompetitor(competitorId: string, timeBudgetMs?: number, offset?: number): Promise<ScrapeResult> {
  const supabase = getServiceClient();

  // Get competitor info
  const { data: competitor } = await supabase
    .from('competitors')
    .select('*')
    .eq('id', competitorId)
    .single();

  if (!competitor) throw new Error(`Competitor ${competitorId} not found`);

  const result: ScrapeResult = {
    competitorId,
    competitorName: competitor.name,
    productsScraped: 0,
    newPrices: 0,
    alerts: 0,
    errors: [],
    totalUrls: 0,
    urlsProcessed: 0,
    nextOffset: 0,
    hasMore: false,
  };

  // Log start
  const { data: log } = await supabase
    .from('scraping_logs')
    .insert({
      competitor_id: competitorId,
      status: 'RUNNING',
      message: `Startar scraping av ${competitor.name}`,
    })
    .select()
    .single();

  const startTime = Date.now();

  try {
    // Step 1: Discover product URLs
    const isOwn = competitor.is_own_store;
    const urlLimit = isOwn ? 1500 : 1000;
    let urls: string[] = [];
    if (competitor.sitemap_url) {
      urls = await discoverProductUrls(competitor.sitemap_url, urlLimit, isOwn);
    }

    // Fallback: scrape category pages for stores with no product URLs in sitemap
    if (urls.length === 0 && competitor.url) {
      const categoryPaths = [
        '/barnvagnar', '/bilstolar', '/bilbarnstolar', '/babyskydd',
        '/barnvagnar/duovagnar', '/barnvagnar/sittvagnar', '/barnvagnar/sulky',
        '/barnvagnar/syskonvagnar', '/barnvagnar/liggvagnar',
        '/barnvagnar/barnvagnspaket', '/barnvagnar/joggingvagnar',
        '/bilstolar/babyskydd', '/bilbarnstolar/babyskydd',
        '/bilbarnstolar/bakatvanda-bilbarnstolar', '/bilbarnstolar/framatvanda-bilbarnstolar',
        '/bilbarnstolar/balteskuddar',
        // Bonti brand pages
        '/barnvagnar/varumarken/bugaboo', '/barnvagnar/varumarken/cybex',
        '/barnvagnar/varumarken/britax', '/barnvagnar/varumarken/joolz',
        '/barnvagnar/varumarken/stokke', '/barnvagnar/varumarken/nuna',
        '/barnvagnar/varumarken/thule', '/barnvagnar/varumarken/emmaljunga',
        '/barnvagnar/varumarken/uppababy', '/barnvagnar/varumarken/maxi-cosi',
        '/barnvagnar/varumarken/joie', '/barnvagnar/varumarken/babyzen',
        '/barnvagnar/varumarken/silver-cross', '/barnvagnar/varumarken/peg-perego',
        '/barnvagnar/varumarken/hauck', '/barnvagnar/varumarken/chicco',
        '/barnvagnar/varumarken/elodie',
        '/bilbarnstolar/varumarken/besafe', '/bilbarnstolar/varumarken/axkid',
        '/bilbarnstolar/varumarken/cybex', '/bilbarnstolar/varumarken/maxi-cosi',
        '/bilbarnstolar/varumarken/britax', '/bilbarnstolar/varumarken/joie',
        '/bilbarnstolar/varumarken/nuna', '/bilbarnstolar/varumarken/recaro',
        // Jollyroom category pages
        '/barnvagnar/duovagnar-kombivagnar', '/barnvagnar/duovagnar-kombivagnar/duovagnar',
        '/barnvagnar/duovagnar-kombivagnar/kombivagnar',
        '/barnvagnar/sittvagnar', '/barnvagnar/sittvagnar/sulkyvagnar',
        '/barnvagnar/syskonvagnar', '/barnvagnar/liggvagnar',
        '/bilbarnstolar/babyskydd', '/bilbarnstolar/bakatvanda-bilbarnstolar',
        '/bilbarnstolar/framatvanda-bilbarnstolar', '/bilbarnstolar/balteskuddar',
        // My Baby category pages
        '/barnvagnar', '/bilstolar', '/babyskydd',
      ];
      urls = await discoverFromCategoryPages(competitor.url.replace(/\/$/, ''), categoryPaths, urlLimit, isOwn);
    }

    if (urls.length === 0) {
      result.errors.push('Inga produkt-URLer hittade');
      await updateLog(supabase, log?.id, 'ERROR', 'Inga produkt-URLer hittade', 0, Date.now() - startTime);
      return result;
    }

    // Split URLs into priority (strollers/car seats) and other (brand-only matches)
    const PRIORITY_KEYWORDS = [
      'barnvagn', 'duovagn', 'sittvagn', 'sulky', 'joggingvagn', 'resevagn',
      'bilstol', 'bilbarnstol', 'babyskydd', 'bälteskudde',
      'i-size', 'isofix',
    ];
    const priorityUrls: string[] = [];
    const otherUrls: string[] = [];
    for (const url of urls) {
      const path = url.toLowerCase();
      if (PRIORITY_KEYWORDS.some(kw => path.includes(kw))) {
        priorityUrls.push(url);
      } else {
        otherUrls.push(url);
      }
    }

    // Build scrape list: all priority URLs first, then rotate through others using offset
    const startOffset = offset || 0;
    const rotatedOthers = startOffset < otherUrls.length
      ? [...otherUrls.slice(startOffset), ...otherUrls.slice(0, startOffset)]
      : otherUrls;
    const scrapeList = [...priorityUrls, ...rotatedOthers];

    // Step 2: Scrape each URL
    // Hard time limit: stop before Vercel timeout to allow log update
    const MAX_SCRAPE_MS = timeBudgetMs ? timeBudgetMs - 10_000 : 250_000;
    result.totalUrls = urls.length;

    let processed = 0;
    for (const url of scrapeList) {
      // Safety: stop if approaching timeout
      if (Date.now() - startTime > MAX_SCRAPE_MS) {
        break;
      }
      processed++;
      try {
        const html = await renderPage(url);
        const parsed = parseProductPage(html, url);
        if (!parsed || !parsed.name || !parsed.price) continue;

        await saveProduct(supabase, competitorId, parsed, result);
        result.productsScraped++;

        // Small delay to be polite
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        result.errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    result.urlsProcessed = processed;
    // Track how far we got through the "other" URLs for next run's offset
    const othersProcessed = Math.max(0, processed - priorityUrls.length);
    result.nextOffset = otherUrls.length > 0
      ? (startOffset + othersProcessed) % otherUrls.length
      : 0;
    result.hasMore = otherUrls.length > 0 && othersProcessed < otherUrls.length;

    await updateLog(
      supabase, log?.id, 'SUCCESS',
      `Scrapade ${result.productsScraped} produkter (${result.urlsProcessed}/${urls.length} URLer), ${result.newPrices} nya priser${result.hasMore ? ' (fortsätter…)' : ''}`,
      result.productsScraped, Date.now() - startTime
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    await updateLog(supabase, log?.id, 'ERROR', msg, result.productsScraped, Date.now() - startTime);
  }

  return result;
}

async function saveProduct(
  supabase: SupabaseServiceClient,
  competitorId: string,
  parsed: ParsedProduct,
  result: ScrapeResult
) {
  const normalizedName = normalizeName(parsed.name);
  const modelName = extractModelName(parsed.name);

  // Find or create product
  let product = await findProduct(supabase, normalizedName, parsed);

  if (!product) {
    const { data: newProduct } = await supabase
      .from('products')
      .insert({
        name: modelName,
        normalized_name: normalizeName(modelName),
        brand: parsed.brand,
        category: parsed.category,
        image: parsed.image,
        ean: parsed.ean,
        gtin: parsed.gtin,
      })
      .select()
      .single();

    product = newProduct;
  }

  if (!product) return;

  // Find or create variant
  const variantName = parsed.color
    ? `${modelName} ${parsed.color}`
    : modelName;

  let variant = await findVariant(supabase, product.id, parsed.color);

  if (!variant) {
    const { data: newVariant } = await supabase
      .from('product_variants')
      .insert({
        product_id: product.id,
        color: parsed.color,
        variant_name: variantName,
        image: parsed.image,
      })
      .select()
      .single();

    variant = newVariant;
  }

  if (!variant) return;

  // Price sanity check: reject if price differs >80% from existing prices for this product
  // This prevents bundle/component mismatches (e.g., chassis matched to full duovagn package)
  const { data: existingPrices } = await supabase
    .from('product_prices')
    .select('price')
    .eq('variant_id', variant.id)
    .order('scraped_at', { ascending: false })
    .limit(5);

  if (existingPrices && existingPrices.length > 0 && parsed.price > 0) {
    const avgExisting = existingPrices.reduce((sum: number, p: { price: number }) => sum + p.price, 0) / existingPrices.length;
    if (avgExisting > 0) {
      const ratio = parsed.price / avgExisting;
      if (ratio > 2.0 || ratio < 0.4) {
        // Price is suspiciously different — likely a mismatch, skip
        return;
      }
    }
  }

  // Check if price changed since last scrape
  const { data: lastPrice } = await supabase
    .from('product_prices')
    .select('price, original_price, in_stock')
    .eq('variant_id', variant.id)
    .eq('competitor_id', competitorId)
    .order('scraped_at', { ascending: false })
    .limit(1)
    .single();

  const priceChanged = !lastPrice ||
    lastPrice.price !== parsed.price ||
    lastPrice.in_stock !== parsed.inStock ||
    lastPrice.original_price !== parsed.originalPrice;

  if (priceChanged) {
    await supabase.from('product_prices').insert({
      variant_id: variant.id,
      competitor_id: competitorId,
      price: parsed.price,
      original_price: parsed.originalPrice,
      currency: parsed.currency,
      in_stock: parsed.inStock,
      url: parsed.url,
    });
    result.newPrices++;

    // Create alerts for price changes — only if we also sell this product
    if (lastPrice) {
      // Check if any own store has a price for this product
      const { data: ownStores } = await supabase
        .from('competitors')
        .select('id, name')
        .eq('is_own_store', true)
        .eq('is_active', true);

      const ownStoreIds = (ownStores || []).map((s: { id: string }) => s.id);

      // Get all variants for this product
      const { data: productVariants } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', product.id);

      const allVariantIds = (productVariants || []).map((v: { id: string }) => v.id);

      // Find our latest price for this product (any variant, any own store)
      let ourPrice: number | null = null;
      let ourStoreName = '';
      if (allVariantIds.length > 0 && ownStoreIds.length > 0) {
        const { data: ourPriceData } = await supabase
          .from('product_prices')
          .select('price, competitor_id')
          .in('variant_id', allVariantIds)
          .in('competitor_id', ownStoreIds)
          .order('scraped_at', { ascending: false })
          .limit(1)
          .single();

        if (ourPriceData) {
          ourPrice = ourPriceData.price;
          ourStoreName = (ownStores || []).find((s: { id: string }) => s.id === ourPriceData.competitor_id)?.name || '';
        }
      }

      // Only create alerts if we sell this product
      if (ourPrice !== null) {
        const diff = parsed.price - lastPrice.price;
        const pct = Math.abs(diff / lastPrice.price) * 100;

        if (pct >= 5) {
          const type = diff < 0 ? 'PRICE_DROP' : 'PRICE_INCREASE';
          const severity = pct >= 15 ? 'CRITICAL' : pct >= 10 ? 'HIGH' : 'MEDIUM';
          const comparison = parsed.price < ourPrice
            ? `(billigare än vårt pris ${ourPrice} SEK)`
            : parsed.price > ourPrice
            ? `(dyrare än vårt pris ${ourPrice} SEK)`
            : `(samma som vårt pris)`;

          await supabase.from('alerts').insert({
            type,
            severity,
            title: `${type === 'PRICE_DROP' ? 'Prissänkning' : 'Prishöjning'}: ${product.name}`,
            message: `${parsed.brand} ${product.name} hos ${result.competitorName}: ${lastPrice.price} → ${parsed.price} SEK (${diff > 0 ? '+' : ''}${pct.toFixed(1)}%) ${comparison}`,
            product_id: product.id,
            competitor_id: competitorId,
          });
          result.alerts++;
        }

        // Stock change alert
        if (lastPrice.in_stock !== parsed.inStock) {
          await supabase.from('alerts').insert({
            type: 'STOCK_CHANGE',
            severity: 'MEDIUM',
            title: `Lagerstatus ändrad: ${product.name}`,
            message: `${product.name} hos ${result.competitorName}: ${parsed.inStock ? 'Åter i lager' : 'Slut i lager'} (vårt pris: ${ourPrice} SEK via ${ourStoreName})`,
            product_id: product.id,
            competitor_id: competitorId,
          });
          result.alerts++;
        }

        // Campaign detection
        if (!lastPrice.original_price && parsed.originalPrice && parsed.originalPrice > parsed.price) {
          const comparison = parsed.price < ourPrice
            ? `Vi är dyrare (${ourPrice} SEK)`
            : `Vi är billigare (${ourPrice} SEK)`;

          await supabase.from('alerts').insert({
            type: 'NEW_CAMPAIGN',
            severity: 'HIGH',
            title: `Ny kampanj: ${product.name}`,
            message: `${product.name} hos ${result.competitorName}: ${parsed.originalPrice} → ${parsed.price} SEK. ${comparison}`,
            product_id: product.id,
            competitor_id: competitorId,
          });
          result.alerts++;
        }
      }
    }
  }
}

async function findProduct(
  supabase: SupabaseServiceClient,
  normalizedName: string,
  parsed: ParsedProduct
) {
  // Step 1: GTIN/EAN match (most reliable)
  if (parsed.gtin) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('gtin', parsed.gtin)
      .limit(1)
      .single();
    if (data) return data;
  }

  if (parsed.ean) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('ean', parsed.ean)
      .limit(1)
      .single();
    if (data) return data;
  }

  // Step 2: Exact normalized_name match (with type compatibility check)
  const modelNormalized = normalizeName(extractModelName(parsed.name));
  {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('normalized_name', modelNormalized)
      .limit(5);
    if (data && data.length > 0) {
      const compatible = data.filter((d: { name: string }) => areTypesCompatible(parsed.name, d.name, parsed.url));
      if (compatible.length === 1) return compatible[0];
      if (compatible.length > 1) {
        const best = pickBestMatch(compatible, parsed.name);
        if (best) return best;
      }
    }
  }

  // Step 3: Model key ILIKE with brand match (fuzzy brand)
  const modelKey = extractModelKey(parsed.name, parsed.brand);
  const brandCandidates = await findByBrand(supabase, parsed.brand);

  if (modelKey && modelKey !== 'okänt') {
    const brandLower = parsed.brand.toLowerCase().replace(/\s+/g, '-');
    const modelWords = modelKey.replace(brandLower, '').trim();
    if (modelWords.length >= 3) {
      // Filter brand candidates by model words
      const allWordsLower = modelWords.split(' ');
      const nameMatches = brandCandidates.filter((p: { normalized_name: string }) =>
        allWordsLower.every(w => p.normalized_name.includes(w))
      );
      const compatible = nameMatches.filter((d: { name: string }) => areTypesCompatible(parsed.name, d.name, parsed.url));
      if (compatible.length === 1) return compatible[0];
      if (compatible.length > 1) {
        const best = pickBestMatch(compatible, parsed.name);
        if (best) return best;
      }

      // Try with just the first model word (e.g., "fox", "fame", "sirona")
      const firstWord = allWordsLower[0];
      if (firstWord && firstWord.length >= 3) {
        const firstWordMatches = brandCandidates.filter((p: { normalized_name: string }) =>
          p.normalized_name.includes(firstWord)
        );
        const compat2 = firstWordMatches.filter((d: { name: string }) => areTypesCompatible(parsed.name, d.name, parsed.url));
        if (compat2.length === 1) return compat2[0];
        if (compat2.length > 1) {
          const best = pickBestMatch(compat2, parsed.name);
          if (best) return best;
        }
      }
    }
  }

  // Step 4: Brand-only search with token overlap scoring
  if (brandCandidates.length > 0) {
    const compatible = brandCandidates.filter((c: { name: string }) => areTypesCompatible(parsed.name, c.name, parsed.url));
    const best = pickBestMatch(compatible, parsed.name, 0.7); // Higher threshold to avoid false matches
    if (best) return best;
  }

  return null;
}

// Brand aliases for fuzzy matching (e.g. "Britax Römer" should match "Britax")
const BRAND_ALIASES: Record<string, string[]> = {
  'britax': ['britax', 'britax römer', 'britax romer'],
  'maxi-cosi': ['maxi-cosi', 'maxicosi', 'maxi cosi', 'maxi-cosi'],
  'stokke': ['stokke', 'stokke®'],
  'elodie': ['elodie', 'elodie details'],
  'cybex': ['cybex'],
  'bugaboo': ['bugaboo'],
  'joie': ['joie'],
  'axkid': ['axkid'],
  'besafe': ['besafe'],
  'nuna': ['nuna'],
  'thule': ['thule'],
  'joolz': ['joolz'],
  'emmaljunga': ['emmaljunga'],
  'crescent': ['crescent'],
  'beemoo': ['beemoo'],
  'kinderkraft': ['kinderkraft'],
  'silver cross': ['silver cross', 'silvercross'],
  'baby jogger': ['baby jogger', 'babyjogger'],
  'uppababy': ['uppababy'],
  'bebeconfort': ['bebeconfort', 'bébé confort'],
  'lionelo': ['lionelo'],
  'hauck': ['hauck'],
  'doona': ['doona'],
  'babyzen': ['babyzen'],
};

function getBrandFamily(brand: string): string {
  const lower = brand.toLowerCase().replace(/[®]+/g, '').trim();
  for (const [family, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      if (lower === alias || lower.includes(alias) || alias.includes(lower)) {
        return family;
      }
    }
  }
  return lower.replace(/[\s\-]+/g, '');
}

// Find all active products matching a brand (with fuzzy matching)
async function findByBrand(
  supabase: SupabaseServiceClient,
  brand: string
): Promise<Array<{ id: string; name: string; normalized_name: string; brand: string }>> {
  const family = getBrandFamily(brand);
  const aliases = BRAND_ALIASES[family] || [brand.toLowerCase()];

  // Query with multiple OR conditions for brand aliases
  let allResults: Array<{ id: string; name: string; normalized_name: string; brand: string }> = [];
  for (const alias of aliases) {
    const { data } = await supabase
      .from('products')
      .select('id, name, normalized_name, brand')
      .eq('is_active', true)
      .ilike('brand', alias)
      .limit(100);
    if (data) allResults.push(...data);
  }

  // Also try exact match as fallback
  const { data: exact } = await supabase
    .from('products')
    .select('id, name, normalized_name, brand')
    .eq('is_active', true)
    .eq('brand', brand)
    .limit(100);
  if (exact) allResults.push(...exact);

  // Deduplicate
  const seen = new Set<string>();
  return allResults.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

// Pick the best matching product from candidates using token overlap
function pickBestMatch(
  candidates: Array<{ id: string; name: string; normalized_name: string }>,
  parsedName: string,
  threshold = 0.5
) {
  const parsedKey = extractModelKey(parsedName);
  let bestScore = 0;
  let bestProduct = null;

  for (const c of candidates) {
    const candidateKey = extractModelKey(c.name);
    const score = tokenOverlapScore(parsedKey, candidateKey);
    if (score > bestScore) {
      bestScore = score;
      bestProduct = c;
    }
  }

  return bestScore >= threshold ? bestProduct : null;
}

async function findVariant(
  supabase: SupabaseServiceClient,
  productId: string,
  color: string | null
) {
  const query = supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId);

  if (color) {
    query.eq('color', color);
  } else {
    query.is('color', null);
  }

  const { data } = await query.limit(1).single();
  return data;
}

async function updateLog(
  supabase: SupabaseServiceClient,
  logId: string | undefined,
  status: string,
  message: string,
  productsScraped: number,
  durationMs: number
) {
  if (!logId) return;
  await supabase
    .from('scraping_logs')
    .update({ status, message, products_scraped: productsScraped, duration_ms: durationMs })
    .eq('id', logId);
}

// Scrape a single product URL and save it as an own-store product.
// Then search competitors for matching products to enable price comparison.
export async function scrapeUrl(
  url: string,
  overrides?: { name?: string; category?: string }
): Promise<{ success: boolean; product?: { id: string; name: string; brand: string; price: number }; error?: string }> {
  const supabase = getServiceClient();

  // Step 1: Fetch and parse the URL
  let html: string;
  try {
    html = await renderPage(url);
  } catch {
    return { success: false, error: `Kunde inte hämta sidan: ${url}` };
  }

  const parsed = parseProductPage(html, url);
  if (!parsed || !parsed.name || !parsed.price) {
    return { success: false, error: 'Kunde inte hitta produktdata på sidan' };
  }

  // Apply overrides
  if (overrides?.name) parsed.name = overrides.name;
  if (overrides?.category) parsed.category = overrides.category as ParsedProduct['category'];

  // Step 2: Determine which own store this URL belongs to
  const { data: ownStores } = await supabase
    .from('competitors')
    .select('id, name, url')
    .eq('is_own_store', true)
    .eq('is_active', true);

  let ownStoreId: string | null = null;
  for (const store of ownStores || []) {
    if (store.url && url.includes(new URL(store.url).hostname)) {
      ownStoreId = store.id;
      break;
    }
  }

  if (!ownStoreId) {
    // URL doesn't match any own store — use the first own store as fallback
    if (ownStores && ownStores.length > 0) {
      ownStoreId = ownStores[0].id;
    } else {
      return { success: false, error: 'Inga egna butiker konfigurerade' };
    }
  }

  // Step 3: Save the product
  const storeId = ownStoreId as string;
  const result: ScrapeResult = {
    competitorId: storeId,
    competitorName: 'Manual add',
    productsScraped: 0,
    newPrices: 0,
    alerts: 0,
    totalUrls: 1,
    urlsProcessed: 1,
    nextOffset: 0,
    hasMore: false,
    errors: [],
  };

  await saveProduct(supabase, storeId, parsed, result);

  // Step 4: Find the saved product (may already exist if duplicate)
  const normalizedName = normalizeName(parsed.name);
  const product = await findProduct(supabase, normalizedName, parsed);

  if (!product && result.productsScraped === 0) {
    return { success: false, error: 'Produkten kunde inte sparas' };
  }

  // Step 5: Find matching competitor prices already in the DB
  // When competitors were scraped before this product existed, their prices
  // may be stored under separate product records. Find and merge them.
  if (product) {
    await mergeCompetitorPrices(supabase, product, parsed);
  }

  return {
    success: true,
    product: product ? {
      id: product.id,
      name: product.name,
      brand: product.brand || parsed.brand,
      price: parsed.price,
    } : undefined,
  };
}

// After manually adding a product, find competitor prices that match
// but were stored under separate product records (because the own-store
// product didn't exist when competitors were scraped).
async function mergeCompetitorPrices(
  supabase: SupabaseServiceClient,
  product: { id: string; name: string; brand: string; normalized_name: string },
  parsed: ParsedProduct
) {
  // Get competitor (non-own) store IDs
  const { data: competitors } = await supabase
    .from('competitors')
    .select('id')
    .eq('is_own_store', false)
    .eq('is_active', true);

  if (!competitors?.length) return;
  const competitorIds = competitors.map((c: { id: string }) => c.id);

  // Find other products with similar names from the same brand
  const brandCandidates = await findByBrand(supabase, parsed.brand);
  const modelKey = extractModelKey(parsed.name, parsed.brand);

  const duplicates = brandCandidates.filter((c: { id: string; name: string; normalized_name: string }) => {
    if (c.id === product.id) return false;
    // Check type compatibility
    if (!areTypesCompatible(parsed.name, c.name, parsed.url)) return false;
    // Check name similarity
    const candidateKey = extractModelKey(c.name, product.brand);
    const score = tokenOverlapScore(modelKey, candidateKey);
    return score >= 0.7;
  });

  if (duplicates.length === 0) return;

  console.log(`[mergeCompetitorPrices] Found ${duplicates.length} potential duplicates for "${product.name}":`,
    duplicates.map((d: { name: string }) => d.name));

  for (const dup of duplicates) {
    // Get all variants of the duplicate product
    const { data: dupVariants } = await supabase
      .from('product_variants')
      .select('id, color, variant_name, image')
      .eq('product_id', dup.id);

    if (!dupVariants?.length) continue;

    for (const dupVar of dupVariants) {
      // Get competitor prices for this variant
      const { data: dupPrices } = await supabase
        .from('product_prices')
        .select('*')
        .eq('variant_id', dupVar.id)
        .in('competitor_id', competitorIds);

      if (!dupPrices?.length) continue;

      // Find or create a matching variant in our product
      let targetVariant = await findVariant(supabase, product.id, dupVar.color);
      if (!targetVariant) {
        const { data: newVar } = await supabase
          .from('product_variants')
          .insert({
            product_id: product.id,
            color: dupVar.color,
            variant_name: dupVar.variant_name,
            image: dupVar.image,
          })
          .select()
          .single();
        targetVariant = newVar;
      }

      if (!targetVariant) continue;

      // Move competitor prices to the correct variant
      for (const price of dupPrices) {
        await supabase
          .from('product_prices')
          .update({ variant_id: targetVariant.id })
          .eq('id', price.id);
      }

      console.log(`[mergeCompetitorPrices] Moved ${dupPrices.length} prices from "${dup.name}" variant to "${product.name}"`);
    }

    // If the duplicate product has no remaining prices, deactivate it
    const { data: remainingVariants } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', dup.id);

    let hasRemainingPrices = false;
    for (const rv of remainingVariants || []) {
      const { count } = await supabase
        .from('product_prices')
        .select('*', { count: 'exact', head: true })
        .eq('variant_id', rv.id);
      if (count && count > 0) {
        hasRemainingPrices = true;
        break;
      }
    }

    if (!hasRemainingPrices) {
      await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', dup.id);
      console.log(`[mergeCompetitorPrices] Deactivated empty duplicate product "${dup.name}"`);
    }
  }
}

// Generate price recommendations after scraping
export async function generateRecommendations() {
  const supabase = getServiceClient();

  // Get own stores
  const { data: ownStores } = await supabase
    .from('competitors')
    .select('id')
    .eq('is_own_store', true);

  if (!ownStores?.length) return;

  const ownStoreIds = ownStores.map((s: { id: string }) => s.id);

  // Get all products with variants and recent prices
  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, brand,
      variants:product_variants(
        id, color, variant_name,
        prices:product_prices(
          price, competitor_id, scraped_at
        )
      )
    `)
    .eq('is_active', true);

  if (!products) return;

  for (const product of products) {
    for (const variant of (product.variants || [])) {
      const prices = variant.prices || [];

      // Get latest price per competitor
      const latestByCompetitor = new Map<string, { price: number; scrapedAt: string }>();
      for (const p of prices) {
        const existing = latestByCompetitor.get(p.competitor_id);
        if (!existing || new Date(p.scraped_at) > new Date(existing.scrapedAt)) {
          latestByCompetitor.set(p.competitor_id, { price: p.price, scrapedAt: p.scraped_at });
        }
      }

      // Find our price and lowest competitor price
      let ourPrice: number | null = null;
      let lowestCompetitor: { id: string; price: number } | null = null;

      for (const [compId, entry] of latestByCompetitor) {
        if (ownStoreIds.includes(compId)) {
          ourPrice = entry.price;
        } else {
          if (!lowestCompetitor || entry.price < lowestCompetitor.price) {
            lowestCompetitor = { id: compId, price: entry.price };
          }
        }
      }

      if (!ourPrice || !lowestCompetitor) continue;

      const diff = ((ourPrice - lowestCompetitor.price) / lowestCompetitor.price) * 100;

      // If our price is more than 5% higher, recommend a change
      if (diff > 5) {
        const recommendedPrice = Math.round(lowestCompetitor.price * 0.99); // Beat by 1%

        // Check if recommendation already exists
        const { data: existing } = await supabase
          .from('price_recommendations')
          .select('id')
          .eq('product_id', product.id)
          .eq('variant_id', variant.id)
          .eq('status', 'PENDING')
          .limit(1)
          .single();

        if (!existing) {
          await supabase.from('price_recommendations').insert({
            product_id: product.id,
            variant_id: variant.id,
            competitor_id: lowestCompetitor.id,
            current_price: ourPrice,
            recommended_price: recommendedPrice,
            reason: `Ditt pris (${ourPrice} SEK) är ${diff.toFixed(1)}% högre än billigaste konkurrent (${lowestCompetitor.price} SEK)`,
          });
        }
      }
    }
  }
}
