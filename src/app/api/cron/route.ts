import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scrapeCompetitor, generateRecommendations } from '@/lib/scraper/pipeline';

export const maxDuration = 300; // 5 min on Vercel Pro, 10s on Hobby

// Wrap scrapeCompetitor with a hard timeout so one hanging store can't block others
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

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

  // Get all active competitors with their scrape offset
  // Process own stores first (most important), then competitors
  const { data: competitors } = await supabase
    .from('competitors')
    .select('id, name, scrape_offset, is_own_store')
    .eq('is_active', true)
    .order('is_own_store', { ascending: false });

  if (!competitors?.length) {
    return NextResponse.json({ message: 'No active competitors' });
  }

  // Give each competitor a proportional time budget (total 270s, keep 30s for recs + response)
  const totalBudgetMs = 270_000;
  const perCompetitorMs = Math.floor(totalBudgetMs / competitors.length);

  const results = [];
  for (const competitor of competitors) {
    try {
      const offset = competitor.scrape_offset || 0;
      // Hard timeout per competitor — if it hangs, skip and continue with next
      const result = await withTimeout(
        scrapeCompetitor(competitor.id, perCompetitorMs, offset),
        perCompetitorMs + 5_000, // 5s grace period
        competitor.name,
      );
      results.push(result);

      // Save progress: rotate through non-priority URLs across runs
      await supabase
        .from('competitors')
        .update({ scrape_offset: result.nextOffset })
        .eq('id', competitor.id);
    } catch (err) {
      results.push({
        competitorId: competitor.id,
        competitorName: competitor.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Generate recommendations after scraping
  try {
    await generateRecommendations();
  } catch (err) {
    console.error('Failed to generate recommendations:', err);
  }

  return NextResponse.json({
    message: 'Scraping complete',
    timestamp: new Date().toISOString(),
    results,
  });
}
