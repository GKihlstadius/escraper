import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // Must wait for all parallel store scrapes

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all active competitors
  const { data: competitors } = await supabase
    .from('competitors')
    .select('id, name, is_own_store')
    .eq('is_active', true)
    .order('is_own_store', { ascending: false });

  if (!competitors?.length) {
    return NextResponse.json({ message: 'No active competitors' });
  }

  // Fan out: trigger all stores in PARALLEL as separate serverless functions.
  // Each gets its own 300s budget. The dispatcher awaits all responses.
  const baseUrl = request.nextUrl.origin;
  const secret = process.env.CRON_SECRET;

  const results = await Promise.allSettled(
    competitors.map(async (c) => {
      try {
        const res = await fetch(
          `${baseUrl}/api/cron/scrape-store?id=${c.id}`,
          {
            headers: { Authorization: `Bearer ${secret}` },
            signal: AbortSignal.timeout(290_000),
          }
        );
        const data = await res.json();
        return { name: c.name, ...data };
      } catch (err) {
        return { name: c.name, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );

  // Generate recommendations after all scrapes
  try {
    const res = await fetch(`${baseUrl}/api/cron/scrape-store?recs=1`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(30_000),
    });
    await res.json();
  } catch {}

  const summary = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Unknown error' }
  );

  return NextResponse.json({
    message: 'Scraping complete',
    timestamp: new Date().toISOString(),
    stores: competitors.length,
    results: summary,
  });
}
