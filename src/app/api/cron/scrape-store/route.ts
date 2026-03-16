import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scrapeCompetitor, generateRecommendations } from '@/lib/scraper/pipeline';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const competitorId = request.nextUrl.searchParams.get('id');
  const runRecs = request.nextUrl.searchParams.get('recs') === '1';

  if (!competitorId && !runRecs) {
    return NextResponse.json({ error: 'Missing id or recs param' }, { status: 400 });
  }

  // Generate recommendations only
  if (runRecs) {
    try {
      await generateRecommendations();
      return NextResponse.json({ ok: true, action: 'recommendations' });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get competitor info
  const { data: competitor } = await supabase
    .from('competitors')
    .select('id, name, scrape_offset')
    .eq('id', competitorId)
    .single();

  if (!competitor) {
    return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
  }

  try {
    // Full 280s budget for this single store (keep 20s for response + DB updates)
    const result = await scrapeCompetitor(competitor.id, 280_000, competitor.scrape_offset || 0);

    // Save offset for next run
    await supabase
      .from('competitors')
      .update({ scrape_offset: result.nextOffset })
      .eq('id', competitor.id);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      competitorId: competitor.id,
      competitorName: competitor.name,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
