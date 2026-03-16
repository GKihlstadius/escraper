import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

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

  const baseUrl = request.nextUrl.origin;
  const secret = process.env.CRON_SECRET;

  // Dispatch all store scrapes as separate serverless functions.
  // Each has its own 300s budget and saves results directly to scraping_logs.
  // We fire all requests in parallel and wait only for them to be ACCEPTED
  // (i.e., the server starts processing), not for them to complete.
  // We use a short timeout so fetch resolves/rejects quickly — the important
  // thing is that Vercel receives the request and spawns the function.
  const dispatched: string[] = [];
  await Promise.allSettled(
    competitors.map(async (c) => {
      try {
        // Use AbortController to disconnect after 5s — by then Vercel has
        // received the request and spawned the scrape-store function.
        // The spawned function continues independently with its own 300s budget.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          await fetch(`${baseUrl}/api/cron/scrape-store?id=${c.id}`, {
            headers: { Authorization: `Bearer ${secret}` },
            signal: controller.signal,
          });
        } catch {
          // AbortError is expected — we intentionally disconnect after 5s
        } finally {
          clearTimeout(timeout);
        }
        dispatched.push(c.name);
      } catch {
        dispatched.push(`${c.name} (error)`);
      }
    })
  );

  return NextResponse.json({
    message: 'Scraping dispatched',
    timestamp: new Date().toISOString(),
    stores: competitors.length,
    dispatched,
    note: 'Each store runs as a separate function with 300s budget. Check scraping_logs for results.',
  });
}
