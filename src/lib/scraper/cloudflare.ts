// Cloudflare Browser Rendering /crawl API client

interface CrawlResponse {
  success: boolean;
  result?: {
    id: string;
    status: string;
    pages?: CrawledPage[];
  };
  errors?: Array<{ message: string }>;
}

interface CrawledPage {
  url: string;
  status: number;
  html?: string;
  markdown?: string;
}

interface CrawlOptions {
  url: string;
  maxPages?: number;
  filterPatterns?: string[];
  render?: boolean;
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

export async function startCrawl(options: CrawlOptions): Promise<string> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare credentials not configured');
  }

  const body: Record<string, unknown> = {
    url: options.url,
  };

  if (options.maxPages) body.maxPages = options.maxPages;
  if (options.filterPatterns) body.filterPatterns = options.filterPatterns;
  if (options.render !== undefined) body.render = options.render;

  const res = await fetch(`${CF_API_BASE}/${accountId}/browser-rendering/crawl`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data: CrawlResponse = await res.json();

  if (!data.success || !data.result?.id) {
    const msg = data.errors?.[0]?.message || 'Unknown crawl error';
    throw new Error(`Cloudflare crawl failed: ${msg}`);
  }

  return data.result.id;
}

export async function getCrawlResult(jobId: string): Promise<CrawledPage[]> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  const res = await fetch(`${CF_API_BASE}/${accountId}/browser-rendering/crawl/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
    },
  });

  const data: CrawlResponse = await res.json();

  if (!data.success) {
    throw new Error('Failed to get crawl result');
  }

  if (data.result?.status === 'complete' && data.result.pages) {
    return data.result.pages;
  }

  if (data.result?.status === 'running') {
    return []; // Still running, caller should poll
  }

  throw new Error(`Unexpected crawl status: ${data.result?.status}`);
}

// Poll until complete (max 2 minutes)
export async function crawlAndWait(options: CrawlOptions): Promise<CrawledPage[]> {
  const jobId = await startCrawl(options);
  const maxWait = 120_000;
  const interval = 3_000;
  let elapsed = 0;

  while (elapsed < maxWait) {
    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;

    const pages = await getCrawlResult(jobId);
    if (pages.length > 0) return pages;
  }

  throw new Error('Crawl timed out');
}

// Simple single-page fetch — tries direct fetch first, falls back to CF Browser
// Rendering only when the page appears to need JS rendering (no product data in HTML).
export async function renderPage(url: string): Promise<string> {
  // Try direct fetch first (fast, no rate limits)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PriceBot/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    const html = await res.text();

    // Check if the HTML contains actual product data (not just a SPA shell)
    // Only use reliable structured data indicators — the <h1> + 'kr' heuristic
    // causes false positives on SPA shells (e.g. My Baby's Abicart template)
    const hasProductData = html.includes('application/ld+json') ||
      html.includes('itemprop="price"') ||
      html.includes('product:price:amount');

    if (hasProductData) return html;

    // Page might need JS rendering — try CF Browser Rendering
    // If the page is an SPA shell (has tws- web components), wait for JSON-LD injection
    const needsWait = html.includes('tws-') || html.includes('textalk');
    const cfHtml = await renderWithCF(url, needsWait ? 'script[type="application/ld+json"]' : undefined);
    return cfHtml || html; // Fall back to original HTML if CF fails
  } catch {
    // Direct fetch failed, try CF
    const cfHtml = await renderWithCF(url);
    if (cfHtml) return cfHtml;
    throw new Error(`Failed to fetch ${url}`);
  }
}

let lastCFRequest = 0;
const CF_MIN_DELAY = 2000; // 2s between CF requests to avoid rate limiting

async function renderWithCF(url: string, waitFor?: string): Promise<string | null> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) return null;

  // Rate limit ourselves to avoid 429s
  const now = Date.now();
  const timeSinceLast = now - lastCFRequest;
  if (timeSinceLast < CF_MIN_DELAY) {
    await new Promise(r => setTimeout(r, CF_MIN_DELAY - timeSinceLast));
  }
  lastCFRequest = Date.now();

  try {
    const res = await fetch(`${CF_API_BASE}/${accountId}/browser-rendering/content`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        ...(waitFor && { waitFor }),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      // If rate limited, wait longer before next request
      if (res.status === 429) {
        lastCFRequest = Date.now() + 5000;
      }
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return (data as { result?: string }).result || null;
    }
    return await res.text();
  } catch {
    return null;
  }
}
