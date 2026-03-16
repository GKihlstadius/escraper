import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60; // Dispatcher only needs ~10s, but allow headroom

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

  // Fan out: trigger a separate serverless function per store
  // Each gets its own 300s budget instead of sharing one
  const baseUrl = request.nextUrl.origin;
  const secret = process.env.CRON_SECRET;

  const results = await Promise.allSettled(
    competitors.map(async (c) => {
      const res = await fetch(
        `${baseUrl}/api/cron/scrape-store?id=${c.id}`,
        {
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(295_000),
        }
      );
      const data = await res.json();
      return { competitorId: c.id, name: c.name, ...data };
    })
  );

  // Trigger recommendations after all scrapes complete
  fetch(`${baseUrl}/api/cron/scrape-store?recs=1`, {
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {}); // fire-and-forget

  const summary = results.map((r) => {
    if (r.status === 'fulfilled') return r.value;
    return { error: r.reason?.message || 'Unknown error' };
  });

  return NextResponse.json({
    message: 'Scraping dispatched',
    timestamp: new Date().toISOString(),
    stores: competitors.length,
    results: summary,
  });
}
