// Scraping pipeline: discover → fetch → parse → save
import { createClient } from '@supabase/supabase-js';
import { discoverProductUrls, discoverFromCategoryPages } from './sitemap';
import { renderPage } from './cloudflare';
import { parseProductPage, normalizeName, extractModelName, extractModelKey, normalizeBrand, tokenOverlapScore, type ParsedProduct } from './parser';

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
    const urlLimit = isOwn ? 1500 : 500;
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

    // Prioritize stroller/car-seat URLs over accessories
    const PRIORITY_KEYWORDS = [
      'barnvagn', 'duovagn', 'sittvagn', 'sulky', 'joggingvagn',
      'bilstol', 'bilbarnstol', 'babyskydd', 'bälteskudde',
      'i-size', 'isofix',
    ];
    urls.sort((a, b) => {
      const aPath = a.toLowerCase();
      const bPath = b.toLowerCase();
      const aHas = PRIORITY_KEYWORDS.some(kw => aPath.includes(kw)) ? 0 : 1;
      const bHas = PRIORITY_KEYWORDS.some(kw => bPath.includes(kw)) ? 0 : 1;
      return aHas - bHas;
    });

    // Step 2: Scrape each URL
    // Hard time limit: stop before Vercel timeout to allow log update
    const MAX_SCRAPE_MS = timeBudgetMs ? timeBudgetMs - 10_000 : 250_000;
    const startOffset = offset || 0;
    const urlSlice = urls.slice(startOffset);
    result.totalUrls = urls.length;

    let processed = 0;
    for (const url of urlSlice) {
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

    result.urlsProcessed = startOffset + processed;
    result.hasMore = result.urlsProcessed < urls.length;

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

  // Step 2: Exact normalized_name match
  const modelNormalized = normalizeName(extractModelName(parsed.name));
  {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('normalized_name', modelNormalized)
      .limit(1)
      .single();
    if (data) return data;
  }

  // Step 3: Model key ILIKE with brand match
  const modelKey = extractModelKey(parsed.name, parsed.brand);
  if (modelKey && modelKey !== 'okänt') {
    const brandLower = parsed.brand.toLowerCase().replace(/\s+/g, '-');
    const modelWords = modelKey.replace(brandLower, '').trim();
    if (modelWords.length >= 3) {
      // Try with all model words first
      const allWordsPattern = `%${modelWords.split(' ').join('%')}%`;
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('brand', parsed.brand)
        .ilike('normalized_name', allWordsPattern)
        .limit(1)
        .single();
      if (data) return data;

      // Try with just the first model word (e.g., "fox", "fame", "sirona")
      const firstWord = modelWords.split(' ')[0];
      if (firstWord && firstWord.length >= 3) {
        const { data: d2 } = await supabase
          .from('products')
          .select('*')
          .eq('brand', parsed.brand)
          .ilike('normalized_name', `%${firstWord}%`)
          .limit(5);
        if (d2 && d2.length === 1) return d2[0];
        // If multiple matches, pick best by token overlap
        if (d2 && d2.length > 1) {
          const best = pickBestMatch(d2, parsed.name);
          if (best) return best;
        }
      }
    }
  }

  // Step 4: Brand-only search with token overlap scoring
  // Useful when names differ a lot but share core model words
  if (parsed.brand && parsed.brand !== 'Okänt') {
    const { data: candidates } = await supabase
      .from('products')
      .select('*')
      .eq('brand', parsed.brand)
      .eq('is_active', true)
      .limit(100);

    if (candidates && candidates.length > 0) {
      const best = pickBestMatch(candidates, parsed.name, 0.6);
      if (best) return best;
    }
  }

  return null;
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
      const latestByCompetitor = new Map<string, number>();
      for (const p of prices) {
        const existing = latestByCompetitor.get(p.competitor_id);
        if (!existing || new Date(p.scraped_at) > new Date(existing.toString())) {
          latestByCompetitor.set(p.competitor_id, p.price);
        }
      }

      // Find our price and lowest competitor price
      let ourPrice: number | null = null;
      let lowestCompetitor: { id: string; price: number } | null = null;

      for (const [compId, price] of latestByCompetitor) {
        if (ownStoreIds.includes(compId)) {
          ourPrice = price;
        } else {
          if (!lowestCompetitor || price < lowestCompetitor.price) {
            lowestCompetitor = { id: compId, price };
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
