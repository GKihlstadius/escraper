import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeCompetitor, generateRecommendations, scrapeUrl } from '@/lib/scraper/pipeline';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { competitorId, generateRecs, offset, url, name, category } = body;
  console.log('[API /scrape] request:', { url, competitorId, generateRecs, userId: user.id });

  // Scrape a single product URL (from "Lägg till produkt" dialog)
  if (url) {
    try {
      const result = await scrapeUrl(url, { name, category });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    } catch (err) {
      console.error('scrapeUrl error:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Scraping misslyckades' }, { status: 500 });
    }
  }

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
