// Sitemap discovery and URL extraction

const STROLLER_KEYWORDS = [
  'barnvagn', 'duovagn', 'sittvagn', 'joggingvagn', 'vagnspaket',
  'liggvagn', 'syskonvagn', 'resevagn', 'sulky',
];

const CAR_SEAT_KEYWORDS = [
  'bilstol', 'bilbarnstol', 'babyskydd', 'bälteskudde', 'car-seat',
  'i-size', 'isofix',
];

const BRAND_KEYWORDS = [
  'bugaboo', 'cybex', 'thule', 'britax', 'stokke', 'joolz',
  'nuna', 'uppababy', 'emmaljunga', 'maxi-cosi', 'joie', 'babyzen',
  'besafe', 'axkid', 'recaro', 'hauck', 'chicco', 'elodie',
  'silver-cross', 'peg-perego', 'crescent', 'beemoo', 'kinderkraft',
  'lionelo', 'doona', 'baby-jogger', 'bebeconfort', 'mutsy',
  'inglesina', 'cam', 'kunert', 'anex', 'mima', 'icandy',
  'silvercross', 'odder', 'bumprider', 'ergobaby', 'diono',
];

const PRODUCT_KEYWORDS = [...STROLLER_KEYWORDS, ...CAR_SEAT_KEYWORDS, ...BRAND_KEYWORDS];

// Accessory/spare-part keywords to exclude from product matches
const ACCESSORY_KEYWORDS = [
  'bakhjul', 'framhjul', 'hjulpaket', 'hjul-', '-hjul',
  'sufflett', 'sufflettfasten', 'sufflettbag',
  'regnskydd', 'myggnat', 'fotsack', 'parasoll',
  'mugghallare', 'kopphallare', 'cup-holder', 'snacktray',
  'adapter', 'adaptrar', 'handtag', 'handtagsskydd', 'grepp',
  'stativ', 'bygel', 'sakerhetsbygel',
  'sittdyna', 'minimizer', 'madrass',
  'transportvask', 'skotvasko', 'organiser',
  'reservdel', 'reservdelar', 'innerslangar',
  'dack-', 'slang-', 'stabrad',
  'sparkskydd', 'baksatesspegel', 'solskydd', 'solskarm',
  'forankringsband', 'belt-guard', 'satesskydd',
  'connector', 'tullsa',
  'bitring', 'napp', 'hakl',
  'barnvagnstillbehor', 'bilstolstillbehor',
  'sommardyna', 'vagnsdyna', 'barnvagnskrok', 'krok-',
  'barnvagnsreflex', 'reflex', 'inlay',
  'kudde', 'lakan', 'bricka', 'spacer',
  'babyvakt', 'underlagg',
  'dregglis', 'portionsform',
  'tripp-trapp',
  'akpase', 'akpasar', 'miniakpas', 'babyoverall', 'lammskinn',
  'insektnat', 'insektsnat', 'tomteluva', 'babyspegel',
  'comfort-cover', 'komfortinlagg', 'lutningskil',
  'forankringsoglor', 'protection-bag', 'rear-facing-kit',
  'kladsla', 'kladsel',
  'tillbehorspaket',
  'skylt', 'isofix-bas', 'chassi', 'kundretur',
  'vinterset', 'sommarset',
  'visningsexemplar',
  'yoyo-bag', 'yoyo-connect',
  'underlag', 'handledsrem', 'vindskydd', 'barnvagnstacke',
  'footrest', 'jamforelse', 'guide-till',
];

const EXCLUDED_PATH_KEYWORDS = [
  'kundservice', 'aterkallelser', 'varumarken',
  'blogg', 'nyheter', 'kundrecension',
  'kampanj', '/teman/', 'reservdelar',
  'om-oss', 'villkor', 'oppettider',
  '/ovrigt/', '/mobler/', '/leksaker/',
  '/babytillbehor/', '/babyprodukter/',
  '/mamma/', '/resa-med-barn/',
  '/akpasar/', '/barnsakerhet/',
  '/barnstolar-tillbehor/', '/ata-dricka/',
  '/barn-baby/', '/foralder/',
  '/textilier/', '/inredning/',
  '/barnvagnstillbehor/', '/bilstolstillbehor/',
  '/handvarmare/', '/sittdynor/',
  '/guider/', '/bast-i-test/', '/trends/',
  '/space-race/', '/information',
  'vanliga-fragor',
  '/inspiration/', '/blogg/', '/tips-och-rad/',
  '/recension/', '/qa-med-',
];

// Jollyroom product categories (path segment 1)
const JOLLYROOM_PRODUCT_CATEGORIES = [
  'duovagnar', 'duovagnar-kombivagnar', 'sittvagnar', 'syskonvagnar', 'liggvagnar', 'sulkyvagnar',
  'babyskydd', 'bakatvanda-bilbarnstolar', 'framatvanda-bilbarnstolar', 'balteskuddar',
];

const MAX_SITEMAP_FETCHES = 20;

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const m of matches) {
    const val = m[1]?.trim();
    if (val?.startsWith('http')) locs.push(val);
  }
  return locs;
}

function isSitemapUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.xml') || lower.endsWith('.xml.gz') ||
    lower.includes('sitemap') || lower.includes('smpview') ||
    lower.includes('urlset');
}

function isProductUrl(url: string, ownStore = false): boolean {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  const segments = path.split('/').filter(Boolean);

  // Basic exclusions
  if (path.endsWith('/') || path === '/' || segments.length === 0) return false;

  // Exclude known non-product path patterns
  if (EXCLUDED_PATH_KEYWORDS.some(kw => path.includes(kw))) return false;

  const filename = segments[segments.length - 1] || '';

  // ──────────────────────────────────────────────────────
  // OWN STORES: Accept any URL containing a relevant brand
  // or product keyword. The parser will skip non-product pages.
  // ──────────────────────────────────────────────────────
  if (ownStore) {
    if (path.includes('index.html')) return false;

    // Exclude accessories by filename
    if (ACCESSORY_KEYWORDS.some(kw => filename.includes(kw))) return false;

    const hasBrand = BRAND_KEYWORDS.some(b => path.includes(b));
    const hasProduct = [...STROLLER_KEYWORDS, ...CAR_SEAT_KEYWORDS].some(kw => path.includes(kw));

    // KöpBarnvagn: /sv/artiklar/[product].html — accept if contains brand or product keyword
    if (path.includes('/artiklar/') && path.endsWith('.html')) {
      return hasBrand || hasProduct;
    }

    // Flat URL stores (Bonti): /[product-slug] — single segment = product page
    if (segments.length === 1 && filename.length > 10 && filename.includes('-')) {
      return hasBrand || hasProduct;
    }

    // Multi-segment with .html ending (My Baby etc.)
    if (segments.length >= 2 && path.endsWith('.html')) {
      const lastSeg = segments[segments.length - 1];
      if (lastSeg.length > 15 && (hasBrand || hasProduct)) return true;
    }

    return false;
  }

  // ──────────────────────────────────────────────────────
  // COMPETITORS: More strict — require keyword/brand match
  // ──────────────────────────────────────────────────────

  // Exclude accessories
  if (ACCESSORY_KEYWORDS.some(kw => filename.includes(kw))) return false;

  // KöpBarnvagn-style: /artiklar/[product].html
  if (path.includes('/artiklar/') && path.endsWith('.html')) {
    return BRAND_KEYWORDS.some(b => filename.includes(b)) ||
      [...STROLLER_KEYWORDS, ...CAR_SEAT_KEYWORDS].some(kw => filename.includes(kw));
  }

  // My Baby: /barnvagnar/[product].html or /bilstolar/[product].html
  if (path.endsWith('.html') && segments.length >= 2) {
    const category = segments[0];
    if (['barnvagnar', 'bilstolar', 'babyskydd'].includes(category)) {
      return BRAND_KEYWORDS.some(b => filename.includes(b)) ||
        [...STROLLER_KEYWORDS, ...CAR_SEAT_KEYWORDS].some(kw => filename.includes(kw));
    }
  }

  // Jollyroom: /barnvagnar/[subcategory]/[product-slug]
  if (segments.length >= 3) {
    const cat1 = segments[0];
    const cat2 = segments[1];
    const lastSeg = segments[segments.length - 1];
    const looksLikeProduct = lastSeg.length > 15 && lastSeg.includes('-') && !JOLLYROOM_PRODUCT_CATEGORIES.includes(lastSeg);
    if (looksLikeProduct) {
      if (cat1 === 'barnvagnar' && JOLLYROOM_PRODUCT_CATEGORIES.some(c => cat2 === c)) return true;
      if (cat1 === 'bilbarnstolar' && JOLLYROOM_PRODUCT_CATEGORIES.some(c => cat2 === c)) return true;
    }
  }

  // Flat URL stores (BabySam, Babyland, BabyV, Pyret): /[product-slug]
  if (segments.length === 1) {
    const slug = segments[0].replace(/_/g, '-');
    if ([...STROLLER_KEYWORDS, ...CAR_SEAT_KEYWORDS].some(kw => slug.includes(kw)) && slug.length > 15) return true;
    if (BRAND_KEYWORDS.some(b => slug.includes(b)) && slug.length > 20) return true;
    return false;
  }

  // Generic: product keyword + long slug
  if (segments.length >= 2) {
    const lastSegment = segments[segments.length - 1];
    const looksLikeProduct = lastSegment.length > 20 && lastSegment.includes('-');
    if (looksLikeProduct && [...STROLLER_KEYWORDS, ...CAR_SEAT_KEYWORDS].some(kw => path.includes(kw))) return true;
  }

  return false;
}

async function fetchSitemap(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status}`);
  return await res.text();
}

export async function discoverProductUrls(
  sitemapUrl: string,
  maxUrls: number = 250,
  ownStore: boolean = false
): Promise<string[]> {
  const queue: string[] = [sitemapUrl];
  const visited = new Set<string>();
  const productUrls = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_SITEMAP_FETCHES) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    try {
      const xml = await fetchSitemap(current);
      const locs = extractLocs(xml);

      // Detect if this is a sitemap index
      const isSitemapIndex = xml.includes('<sitemapindex') || xml.includes('</sitemapindex>');

      for (const loc of locs) {
        if (productUrls.size >= maxUrls) break;

        if (isSitemapIndex || isSitemapUrl(loc)) {
          // Always follow child sitemaps from sitemap index
          if (!visited.has(loc)) {
            queue.push(loc);
          }
        } else if (isProductUrl(loc, ownStore)) {
          productUrls.add(loc);
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch sitemap ${current}:`, err);
    }
  }

  return [...productUrls];
}

// For stores like Bonti that only have category pages in their sitemap,
// discover product URLs by scraping category pages (with JS rendering fallback)
export async function discoverFromCategoryPages(
  baseUrl: string,
  categoryPaths: string[],
  maxUrls: number = 100,
  ownStore: boolean = false
): Promise<string[]> {
  const productUrls = new Set<string>();

  for (const catPath of categoryPaths) {
    if (productUrls.size >= maxUrls) break;

    try {
      const url = `${baseUrl}${catPath}`;

      // Try CF Browser Rendering first (for JS-heavy stores)
      let html = '';
      try {
        const { renderPage } = await import('./cloudflare');
        html = await renderPage(url);
      } catch {
        // Fallback to plain fetch
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PriceBot/1.0)' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) continue;
        html = await res.text();
      }

      // Extract product links from category page HTML
      const links = [...html.matchAll(/href=["']([^"']+)["']/g)]
        .map(m => m[1])
        .filter(href => {
          if (!href.startsWith('/') && !href.startsWith('http')) return false;
          const fullUrl = href.startsWith('/') ? `${baseUrl}${href}` : href;
          try {
            const parsed = new URL(fullUrl);
            const path = parsed.pathname.toLowerCase();
            const segs = path.split('/').filter(Boolean);
            if (segs.length < 1) return false;
            if (path.endsWith('/') || path.includes('index')) return false;
            if (EXCLUDED_PATH_KEYWORDS.some(kw => path.includes(kw))) return false;
            if (ACCESSORY_KEYWORDS.some(kw => path.includes(kw))) return false;

            // Own stores: accept any link that looks like a product page
            if (ownStore) {
              const last = segs[segs.length - 1];
              return last.length > 10 && last.includes('-');
            }

            // Competitors: use the same isProductUrl logic
            return isProductUrl(fullUrl, false);
          } catch {
            return false;
          }
        })
        .map(href => href.startsWith('/') ? `${baseUrl}${href}` : href);

      for (const link of links) {
        productUrls.add(link);
        if (productUrls.size >= maxUrls) break;
      }
    } catch {
      // skip
    }
  }

  return [...productUrls];
}
