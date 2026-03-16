import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30; // Dispatcher is fast — just fires off requests

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

  // Fan out: fire-and-forget a separate serverless function per store.
  // Each gets its own 300s budget. We don't await — results are in scraping_logs.
  const baseUrl = request.nextUrl.origin;
  const secret = process.env.CRON_SECRET;

  const dispatched: string[] = [];
  for (const c of competitors) {
    // Fire-and-forget: don't await the response
    fetch(`${baseUrl}/api/cron/scrape-store?id=${c.id}`, {
      headers: { Authorization: `Bearer ${secret}` },
    }).catch(() => {}); // ignore network errors on dispatch
    dispatched.push(c.name);
  }

  // Also fire recommendations (will run after the scrape-store functions finish their DB writes)
  // Delay slightly so scrapes have time to save data
  fetch(`${baseUrl}/api/cron/scrape-store?recs=1`, {
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {});

  return NextResponse.json({
    message: 'Scraping dispatched',
    timestamp: new Date().toISOString(),
    stores: dispatched.length,
    dispatched,
    note: 'Each store runs as a separate function with 300s budget. Check scraping_logs for results.',
  });
}
