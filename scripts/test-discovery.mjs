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

// Test KöpBarnvagn sitemap
console.log('=== KÖPBARNVAGN ===');
try {
  const xml = await fetchSitemap('https://www.kopbarnvagn.se/sitemap.xml');
  const isSitemapIndex = xml.includes('<sitemapindex');
  console.log(`Is sitemap index: ${isSitemapIndex}`);
  const locs = extractLocs(xml);
  console.log(`Total URLs: ${locs.length}`);

  if (isSitemapIndex) {
    // Fetch child sitemaps
    for (const child of locs.slice(0, 5)) {
      console.log(`\n  Child: ${child}`);
      try {
        const childXml = await fetchSitemap(child);
        const childLocs = extractLocs(childXml);
        console.log(`    URLs: ${childLocs.length}`);
        // Show first 10 product-like URLs
        const artiklar = childLocs.filter(u => u.includes('/artiklar/'));
        console.log(`    /artiklar/ URLs: ${artiklar.length}`);
        for (const u of artiklar.slice(0, 5)) {
          console.log(`      ${u}`);
        }
      } catch (e) {
        console.log(`    Error: ${e.message}`);
      }
    }
  } else {
    // Show product-like URLs
    const artiklar = locs.filter(u => u.includes('/artiklar/'));
    console.log(`\n/artiklar/ URLs: ${artiklar.length}`);
    for (const u of artiklar.slice(0, 20)) {
      console.log(`  ${u}`);
    }
  }
} catch (e) {
  console.log(`Error: ${e.message}`);
}

console.log('\n\n=== BONTI ===');
try {
  const xml = await fetchSitemap('https://bonti.se/sitemap.xml');
  const isSitemapIndex = xml.includes('<sitemapindex');
  console.log(`Is sitemap index: ${isSitemapIndex}`);
  const locs = extractLocs(xml);
  console.log(`Total URLs: ${locs.length}`);

  if (isSitemapIndex) {
    for (const child of locs.slice(0, 5)) {
      console.log(`\n  Child: ${child}`);
      try {
        const childXml = await fetchSitemap(child);
        const childLocs = extractLocs(childXml);
        console.log(`    URLs: ${childLocs.length}`);
        for (const u of childLocs.slice(0, 5)) {
          console.log(`      ${u}`);
        }
      } catch (e) {
        console.log(`    Error: ${e.message}`);
      }
    }
  } else {
    // Show some URLs
    console.log('\nSample URLs:');
    for (const u of locs.slice(0, 30)) {
      console.log(`  ${u}`);
    }

    // Check URL patterns
    const barnvagnar = locs.filter(u => u.includes('barnvagn') || u.includes('bilstol') || u.includes('babyskydd'));
    console.log(`\nBarnvagn/bilstol/babyskydd URLs: ${barnvagnar.length}`);
    for (const u of barnvagnar.slice(0, 10)) {
      console.log(`  ${u}`);
    }
  }
} catch (e) {
  console.log(`Error: ${e.message}`);
}
