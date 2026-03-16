import * as cheerio from 'cheerio';
import type { ProductCategory } from '@/types';

export interface ParsedProduct {
  name: string;
  brand: string;
  category: ProductCategory;
  color: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  inStock: boolean;
  url: string;
  image: string | null;
  ean: string | null;
  gtin: string | null;
}

// Known brand names for detection
const KNOWN_BRANDS = [
  'bugaboo', 'cybex', 'thule', 'britax', 'stokke', 'joolz',
  'nuna', 'uppababy', 'maxi-cosi', 'joie', 'babyzen',
  'emmaljunga', 'elodie', 'silver cross', 'cam', 'peg perego',
  'hauck', 'chicco', 'besafe', 'axkid', 'recaro',
  'crescent', 'beemoo', 'kinderkraft', 'lionelo', 'doona',
  'baby jogger', 'inglesina', 'mutsy', 'mima', 'icandy',
  'bumprider', 'ergobaby', 'diono', 'kunert', 'anex',
];

// Category detection from product name/URL
const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: ProductCategory }> = [
  { pattern: /duovagn|duo\s*vagn|complete.*vagn|vagn.*complete/i, category: 'duovagn' },
  { pattern: /sittvagn|sitt\s*vagn|sulky|buggy|resevagn/i, category: 'sittvagn' },
  { pattern: /jogg(?:ing)?vagn/i, category: 'joggingvagn' },
  { pattern: /vagnspaket|barnvagnspaket|paket.*vagn/i, category: 'vagnspaket' },
  { pattern: /liggvagn|ligg\s*vagn/i, category: 'liggvagn' },
  { pattern: /syskonvagn|syskon.*vagn|tvilling|double|twin/i, category: 'syskonvagn' },
  { pattern: /babyskydd|baby\s*skydd|spädbarnsskydd|infant.*seat|pebble|aton|cloud\s*[tqz]/i, category: 'babyskydd' },
  { pattern: /bakåtvänd|bakatvänd|rear.?facing|i-size.*(?:9|1[0-8])|modular.*(?:rf|x1)/i, category: 'bakatvänd_bilstol' },
  { pattern: /framåtvänd|framatvänd|forward.?facing/i, category: 'framåtvänd_bilstol' },
  { pattern: /bälteskudde|bältesstol|booster/i, category: 'bälteskudde' },
  { pattern: /bilstol.*paket|bilstolspaket/i, category: 'bilstolspaket' },
  // URL-path based detection (e.g. /barnvagnar/product.html or /bilstolar/product.html)
  { pattern: /\/barnvagnar\//i, category: 'duovagn' },
  { pattern: /\/bilstolar?\//i, category: 'bakatvänd_bilstol' },
  { pattern: /\/bilbarnstol/i, category: 'bakatvänd_bilstol' },
  // Generic name-based fallback
  { pattern: /barnvagn/i, category: 'duovagn' },
  { pattern: /bilstol|car\s*seat/i, category: 'bakatvänd_bilstol' },
];

// Color detection from product name
const COLOR_PATTERNS = [
  /\b(black|svart|midnight\s*black|deep\s*black|matte\s*black)\b/i,
  /\b(white|vit|off\s*white|pure\s*white)\b/i,
  /\b(grey|gray|gr[åa]|dark\s*grey|light\s*grey|melange\s*grey)\b/i,
  /\b(navy|marinblå|dark\s*blue|mörkblå)\b/i,
  /\b(blue|blå|sky\s*blue|steel\s*blue|stormy\s*blue)\b/i,
  /\b(red|röd|dark\s*cherry|burgundy)\b/i,
  /\b(green|grön|forest\s*green|olive|pine\s*green|sage)\b/i,
  /\b(beige|sand|taupe|khaki|dune|desert)\b/i,
  /\b(brown|brun|cognac|espresso|chocolate)\b/i,
  /\b(pink|rosa|rose|blush|misty\s*rose)\b/i,
  /\b(yellow|gul|lemon|mustard)\b/i,
  /\b(purple|lila|lavender)\b/i,
  /\b(orange|coral|peach)\b/i,
  /\b(silver|graphite)\b/i,
  /\b(cream|ivory|pearl)\b/i,
];

export function parsePrice(text: string): number | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\s+/g, '')
    .replace(/kr|sek|:-/gi, '')
    .replace(/&nbsp;/g, '')
    .trim();

  // Handle "12 345,00" or "12345.00"
  const match = cleaned.match(/(\d[\d\s]*)[:.,](\d{1,2})$/);
  if (match) {
    const whole = match[1].replace(/\s/g, '');
    return parseFloat(`${whole}.${match[2]}`);
  }

  const simple = cleaned.replace(/\s/g, '').match(/(\d+)/);
  if (simple) {
    const num = parseInt(simple[1], 10);
    return num > 0 ? num : null;
  }

  return null;
}

export function detectBrand(name: string): string {
  const lower = name.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) {
      return brand.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return 'Okänt';
}

export function detectCategory(name: string, url?: string): ProductCategory {
  const text = `${name} ${url || ''}`;
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'övrigt';
}

export function detectColor(name: string): string | null {
  for (const pattern of COLOR_PATTERNS) {
    const match = name.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Build a normalized name for matching (strip color, lowercase, simplify)
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\såäöé-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract product model base name (for grouping variants)
export function extractModelName(name: string): string {
  let model = name;
  // Remove color suffixes
  for (const pattern of COLOR_PATTERNS) {
    model = model.replace(pattern, '');
  }
  // Clean up
  return model.replace(/\s+/g, ' ').replace(/[,/]+\s*$/, '').trim();
}

// Words to strip from model keys (not useful for matching)
const MODEL_STRIP_WORDS = [
  'inkl', 'inkl.', 'inklusive', 'med', 'plus',
  'onesize', 'one-size', '2024', '2025', '2023', '2022', '2026',
  'essential', 'authentic', 'fresh', 'twillic', 'cab',
  'bilbarnstol', 'bilstol', 'bälteskudde', 'bältesstol',
  'barnvagn', 'duovagn', 'sittvagn', 'syskonvagn', 'joggingvagn',
  'liggvagn', 'sulky', 'buggy', 'kombivagn', 'barnvagnspaket',
  'vagnspaket', 'paket', 'komplett', 'set',
  'liggdel', 'sittdel', 'sittbas', 'chassi', 'chassis',
  'babyskydd', 'i-size', 'r129', 'r44',
  'och', 'för', 'till', 'med', 'av', 'den', 'det', 'nya',
  'stroller', 'pushchair', 'pram', 'car', 'seat',
];

// Product type categories for matching discrimination
// A "duovagn paket" should NOT match a standalone "sittvagn"
const BUNDLE_INDICATORS = ['paket', 'komplett', 'set', 'bundle', 'barnvagnspaket', 'vagnspaket', 'kombivagn', 'inkl', 'inklusive'];
const PRODUCT_TYPES: Record<string, string> = {
  'duovagn': 'duovagn',
  'sittvagn': 'sittvagn',
  'liggvagn': 'liggvagn',
  'syskonvagn': 'syskonvagn',
  'joggingvagn': 'joggingvagn',
  'sulky': 'sittvagn',
  'buggy': 'sittvagn',
  'bilbarnstol': 'bilstol',
  'bilstol': 'bilstol',
  'bälteskudde': 'bälteskudde',
  'bältesstol': 'bältesstol',
  'babyskydd': 'babyskydd',
  'liggdel': 'tillbehör',
  'sittdel': 'tillbehör',
  'sittbas': 'tillbehör',
  'chassi': 'tillbehör',
  'chassis': 'tillbehör',
  'skidor': 'tillbehör',
  'åkpåse': 'tillbehör',
  'regnskydd': 'tillbehör',
  'adapter': 'tillbehör',
  'sufflett': 'tillbehör',
  'mugghållare': 'tillbehör',
  'fotsack': 'tillbehör',
  'insekt': 'tillbehör',
  'insektsnät': 'tillbehör',
  'solskydd': 'tillbehör',
  'körkåpa': 'tillbehör',
  'handtag': 'tillbehör',
  'hjul': 'tillbehör',
  'madrass': 'tillbehör',
  'isofix bas': 'tillbehör',
  'isofix-bas': 'tillbehör',
  'base t': 'tillbehör',
  'base m': 'tillbehör',
  'base z': 'tillbehör',
  'i-base': 'tillbehör',
  'basefix': 'tillbehör',
  'familyfix': 'tillbehör',
  'vindskydd': 'tillbehör',
  'parasoll': 'tillbehör',
  'köpåse': 'tillbehör',
  'organiser': 'tillbehör',
  'transportväska': 'tillbehör',
  'resväska': 'tillbehör',
  'skötväska': 'tillbehör',
  'cupholder': 'tillbehör',
  'cup holder': 'tillbehör',
  'footmuff': 'tillbehör',
  'raincover': 'tillbehör',
  'syskonsits': 'tillbehör',
  'extrasits': 'tillbehör',
  'extra sits': 'tillbehör',
  'solsuflett': 'tillbehör',
  'breezy suflett': 'tillbehör',
  'snack tray': 'tillbehör',
  'snack-tray': 'tillbehör',
  'barsele': 'tillbehör',
  'cabin bag': 'tillbehör',
  'cabin väska': 'tillbehör',
  'resebag': 'tillbehör',
  'travel bag': 'tillbehör',
  'bilstolsbas': 'tillbehör',
};

// Detect if a product name indicates a bundle/package
export function isBundle(name: string): boolean {
  const lower = name.toLowerCase();
  return BUNDLE_INDICATORS.some(w => lower.includes(w));
}

// Extract the product type from a name (and optionally URL)
export function extractProductType(name: string, url?: string): string | null {
  const lower = name.toLowerCase();
  for (const [keyword, type] of Object.entries(PRODUCT_TYPES)) {
    if (lower.includes(keyword)) return type;
  }
  // Also check URL path for accessory keywords (e.g. /cybex-gazelle-s-liggdel-...)
  if (url) {
    const urlLower = url.toLowerCase();
    for (const [keyword, type] of Object.entries(PRODUCT_TYPES)) {
      if (type === 'tillbehör' && urlLower.includes(keyword)) return type;
    }
    // Additional URL-only accessory patterns
    const urlAccessoryPatterns = [
      'bas-till', 'base-', '-bas-', '-base-', 'isofix-bas', 'i-base',
      '-liggdel-', '-sittdel-', '-syskonsits-', '-snack-tray',
      '-solsuflett-', '-breezy-', '-barsele-', '-bilstolsbas',
      '-cabin-', '-travel-bag-', '-resebag-', '-footmuff-',
    ];
    for (const pattern of urlAccessoryPatterns) {
      if (urlLower.includes(pattern)) return 'tillbehör';
    }
  }
  return null;
}

// Check if two product names are type-compatible for matching.
// Also accepts URLs for better accessory detection.
export function areTypesCompatible(
  nameA: string,
  nameB: string,
  urlA?: string,
  urlB?: string
): boolean {
  const bundleA = isBundle(nameA);
  const bundleB = isBundle(nameB);
  // A bundle should not match a non-bundle
  if (bundleA !== bundleB) return false;

  const typeA = extractProductType(nameA, urlA);
  const typeB = extractProductType(nameB, urlB);

  // If either is an accessory/tillbehör, they only match other accessories
  if (typeA === 'tillbehör' || typeB === 'tillbehör') {
    return typeA === typeB;
  }

  // If both have types, they must match
  if (typeA && typeB && typeA !== typeB) return false;

  return true;
}

// Extract a canonical model key for cross-store matching.
// e.g., "Maxi-Cosi Fame Sittvagn Twillic Truffle" → "maxi-cosi fame"
//       "Fame Sittvagn - Twillic" → "maxi-cosi fame" (when brand detected)
export function extractModelKey(name: string, brand?: string): string {
  let text = name.toLowerCase();

  // Strip colors
  for (const pattern of COLOR_PATTERNS) {
    text = text.replace(pattern, '');
  }

  // Remove punctuation except hyphens
  text = text.replace(/[^\w\såäöé-]/g, ' ').replace(/\s+/g, ' ').trim();

  // Split into words
  let words = text.split(/\s+/);

  // Remove noise words
  words = words.filter(w =>
    w.length > 1 &&
    !MODEL_STRIP_WORDS.includes(w) &&
    !/^\d{1,2}$/.test(w) // remove lone numbers like "2" or "3"
  );

  // Detect brand from words or use provided brand
  const detectedBrand = (brand || detectBrand(name)).toLowerCase().replace(/\s+/g, '-');

  // Remove brand name from words if present
  const brandWords = detectedBrand.split('-');
  words = words.filter(w => !brandWords.includes(w));

  // Take the first 2-3 significant model words
  // These are the words that identify the model (e.g., "fox 5", "fame", "sirona t", "izi twist")
  const modelWords = words.filter(w => w.length >= 2).slice(0, 3);

  // Combine brand + model words
  const key = [detectedBrand, ...modelWords].join(' ').trim();
  return key || normalizeName(name);
}

// Normalize brand name for comparison (handles Maxi-Cosi vs Maxi Cosi vs MaxiCosi)
export function normalizeBrand(brand: string): string {
  return brand.toLowerCase().replace(/[\s-]+/g, '').trim();
}

// Calculate token overlap score between two product names (0-1)
export function tokenOverlapScore(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[^\w\såäöé-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1 && !MODEL_STRIP_WORDS.includes(w));

  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  const minSize = Math.min(tokensA.size, tokensB.size);
  return overlap / minSize;
}

// Parse a single product page HTML
export function parseProductPage(html: string, url: string): ParsedProduct | null {
  const $ = cheerio.load(html);

  // Try structured data first (JSON-LD)
  const jsonLd = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => {
      try { return JSON.parse($(el).html() || ''); } catch { return null; }
    })
    .filter(Boolean)
    .find((d: Record<string, unknown>) =>
      d['@type'] === 'Product' || (Array.isArray(d['@graph']) && d['@graph'].some((i: Record<string, unknown>) => i['@type'] === 'Product'))
    );

  if (jsonLd) {
    const product = jsonLd['@type'] === 'Product'
      ? jsonLd
      : jsonLd['@graph']?.find((i: Record<string, unknown>) => i['@type'] === 'Product');

    if (product) {
      return parseFromJsonLd(product, url);
    }
  }

  // Fallback: parse from HTML selectors
  return parseFromHtml($, url);
}

function parseFromJsonLd(data: Record<string, unknown>, url: string): ParsedProduct | null {
  const name = String(data.name || '');
  if (!name) return null;

  const offers = data.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const offer = Array.isArray(offers) ? offers[0] : offers;

  const price = parsePrice(String(offer?.price || ''));
  if (!price) return null;

  const gtin = String(data.gtin13 || data.gtin || data.gtin14 || data.gtin12 || '').replace(/\D/g, '') || null;
  const ean = gtin && gtin.length >= 8 && gtin.length <= 14 ? gtin : null;

  return {
    name,
    brand: String((data.brand as Record<string, unknown>)?.name || detectBrand(name)),
    category: detectCategory(name, url),
    color: detectColor(name),
    price,
    originalPrice: null,
    currency: String(offer?.priceCurrency || 'SEK'),
    inStock: String(offer?.availability || '').toLowerCase().includes('instock'),
    url,
    image: String(data.image || (Array.isArray(data.image) ? data.image[0] : '') || ''),
    ean,
    gtin,
  };
}

function parseFromHtml($: cheerio.CheerioAPI, url: string): ParsedProduct | null {
  // Common selectors for Swedish e-commerce (including My Baby tws-* web components)
  const nameSelectors = ['h1', '.product-title', '.product-name', '[itemprop="name"]', 'tws-article-name', '.tws-article-name'];
  const priceSelectors = [
    '.PrisREA', '.sale-price', '.campaign-price', '.current-price',
    '.price--current', '[itemprop="price"]', '.product-price .price',
    '.price:not(.old):not(.original)',
    'tws-article-price', '.tws-article-price', '.tws-price',
  ];
  const originalPriceSelectors = [
    '.PrisORD', '.old-price', '.original-price', '.price--compare-at',
    '.was-price', '[class*="strike"]',
  ];
  const imageSelectors = [
    'meta[property="og:image"]', '.product-image img', '.product-gallery img',
    '[itemprop="image"]',
  ];

  let name = '';
  for (const sel of nameSelectors) {
    name = $(sel).first().text().trim();
    if (name) break;
  }
  if (!name) {
    name = $('meta[property="og:title"]').attr('content')?.trim() || '';
  }
  if (!name) return null;

  let price: number | null = null;
  for (const sel of priceSelectors) {
    const text = $(sel).first().text();
    price = parsePrice(text);
    if (price) break;
  }
  if (!price) {
    const metaPrice = $('meta[property="product:price:amount"]').attr('content');
    if (metaPrice) price = parsePrice(metaPrice);
  }
  if (!price) return null;

  let originalPrice: number | null = null;
  for (const sel of originalPriceSelectors) {
    originalPrice = parsePrice($(sel).first().text());
    if (originalPrice && originalPrice > price) break;
    originalPrice = null;
  }

  let image: string | null = null;
  for (const sel of imageSelectors) {
    image = $(sel).first().attr('content') || $(sel).first().attr('src') || null;
    if (image) break;
  }

  return {
    name,
    brand: detectBrand(name),
    category: detectCategory(name, url),
    color: detectColor(name),
    price,
    originalPrice,
    currency: 'SEK',
    inStock: !$('.out-of-stock, .sold-out, [class*="soldout"]').length,
    url,
    image,
    ean: null,
    gtin: null,
  };
}
