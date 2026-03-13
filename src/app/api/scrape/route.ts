import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeCompetitor, generateRecommendations } from '@/lib/scraper/pipeline';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { competitorId, generateRecs, offset } = body;

  // Generate recommendations only
  if (generateRecs) {
    await generateRecommendations().catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (competitorId) {
    // Scrape single competitor (with optional offset for pagination)
    const result = await scrapeCompetitor(competitorId, undefined, offset || 0);
    return NextResponse.json(result);
  }

  // Scrape all competitors (used by cron — each gets its own timeout budget)
  const { data: competitors } = await supabase
    .from('competitors')
    .select('id, name')
    .eq('is_active', true);

  const results = [];
  for (const competitor of competitors || []) {
    try {
      const result = await scrapeCompetitor(competitor.id);
      results.push(result);
    } catch (err) {
      results.push({
        competitorId: competitor.id,
        competitorName: competitor.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await generateRecommendations().catch(console.error);

  return NextResponse.json({ results });
}
