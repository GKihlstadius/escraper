import 'dotenv/config';

async function fetchSitemap(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PriceBot/1.0)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(u => u.startsWith('http'));
}

// KöpBarnvagn: find actual product pages (not index.html or category pages)
console.log('=== KÖPBARNVAGN PRODUCT URLS ===');
const kbvXml = await fetchSitemap('https://www.kopbarnvagn.se/sitemap.xml');
const kbvLocs = extractLocs(kbvXml);
const kbvProducts = kbvLocs.filter(u => {
  const path = new URL(u).pathname.toLowerCase();
  return path.includes('/artiklar/') && path.endsWith('.html') && !path.includes('index.html');
});
console.log(`Product-like URLs (non-index .html under /artiklar/): ${kbvProducts.length}`);
for (const u of kbvProducts.slice(0, 30)) {
  console.log(`  ${u}`);
}

// Check how many have brand keywords
const BRANDS = ['bugaboo', 'cybex', 'thule', 'britax', 'stokke', 'joolz', 'nuna', 'uppababy', 'emmaljunga', 'maxi-cosi', 'joie', 'babyzen', 'besafe', 'axkid', 'recaro', 'hauck', 'chicco', 'elodie', 'silver-cross', 'peg-perego'];
const withBrand = kbvProducts.filter(u => BRANDS.some(b => u.toLowerCase().includes(b)));
console.log(`\nWith brand keyword: ${withBrand.length} / ${kbvProducts.length}`);
const withoutBrand = kbvProducts.filter(u => !BRANDS.some(b => u.toLowerCase().includes(b)));
console.log('Without brand keyword (sample):');
for (const u of withoutBrand.slice(0, 20)) {
  console.log(`  ${u}`);
}

// Bonti: find actual product pages (deep paths, not category)
console.log('\n\n=== BONTI PRODUCT URLS ===');
const bontiXml = await fetchSitemap('https://bonti.se/sitemap.xml');
const bontiLocs = extractLocs(bontiXml);

// Bonti products are typically at /category/subcategory/product-slug (3+ segments)
// and don't end with just a category name
const bontiDeep = bontiLocs.filter(u => {
  const path = new URL(u).pathname;
  const segs = path.split('/').filter(Boolean);
  return segs.length >= 3;
});
console.log(`URLs with 3+ path segments: ${bontiDeep.length}`);

// Check which look like product pages (have brand in slug)
const bontiWithBrand = bontiDeep.filter(u => BRANDS.some(b => u.toLowerCase().includes(b)));
console.log(`With brand keyword: ${bontiWithBrand.length}`);
for (const u of bontiWithBrand.slice(0, 30)) {
  console.log(`  ${u}`);
}

// Also check 2-segment URLs that might be products
const bonti2seg = bontiLocs.filter(u => {
  const segs = new URL(u).pathname.split('/').filter(Boolean);
  return segs.length === 2;
});
const bonti2segWithBrand = bonti2seg.filter(u => BRANDS.some(b => u.toLowerCase().includes(b)));
console.log(`\n2-segment URLs with brand: ${bonti2segWithBrand.length}`);
for (const u of bonti2segWithBrand.slice(0, 30)) {
  console.log(`  ${u}`);
}

// Single segment products (bonti.se/product-slug)
const bonti1seg = bontiLocs.filter(u => {
  const segs = new URL(u).pathname.split('/').filter(Boolean);
  return segs.length === 1 && BRANDS.some(b => u.toLowerCase().includes(b));
});
console.log(`\n1-segment URLs with brand: ${bonti1seg.length}`);
for (const u of bonti1seg.slice(0, 30)) {
  console.log(`  ${u}`);
}
