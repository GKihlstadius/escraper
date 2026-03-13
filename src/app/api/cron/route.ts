import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scrapeCompetitor, generateRecommendations } from '@/lib/scraper/pipeline';

export const maxDuration = 300; // 5 min on Vercel Pro, 10s on Hobby

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
    .select('id, name')
    .eq('is_active', true);

  if (!competitors?.length) {
    return NextResponse.json({ message: 'No active competitors' });
  }

  // Give each competitor a proportional time budget (total 280s, keep 20s for recs + response)
  const totalBudgetMs = 280_000;
  const perCompetitorMs = Math.floor(totalBudgetMs / competitors.length);

  const results = [];
  for (const competitor of competitors) {
    try {
      const result = await scrapeCompetitor(competitor.id, perCompetitorMs);
      results.push(result);
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
