'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, TrendingDown } from 'lucide-react';

interface Recommendation {
  id: string;
  current_price: number;
  recommended_price: number;
  reason: string;
  status: string;
  created_at: string;
  product: { name: string; brand: string } | null;
  competitor: { name: string } | null;
}

export default function RecommendationsPage() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecs();
  }, []);

  async function loadRecs() {
    const supabase = createClient();
    const { data } = await supabase
      .from('price_recommendations')
      .select(`
        id, current_price, recommended_price, reason, status, created_at,
        product:products(name, brand),
        competitor:competitors(name)
      `)
      .order('created_at', { ascending: false })
      .limit(50);
    setRecs((data || []) as unknown as Recommendation[]);
    setLoading(false);
  }

  async function updateStatus(id: string, status: 'APPLIED' | 'DISMISSED') {
    const supabase = createClient();
    await supabase.from('price_recommendations').update({ status }).eq('id', id);
    setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  const pending = recs.filter((r) => r.status === 'PENDING');
  const handled = recs.filter((r) => r.status !== 'PENDING');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prisrekommendationer</h1>
        <p className="text-muted-foreground">
          {pending.length} väntande rekommendationer
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6 h-24" />
            </Card>
          ))}
        </div>
      ) : pending.length === 0 && handled.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Inga rekommendationer ännu. Kör en scraping för att generera rekommendationer.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Väntande</h2>
              {pending.map((rec) => (
                <RecommendationCard
                  key={rec.id}
                  rec={rec}
                  onApply={() => updateStatus(rec.id, 'APPLIED')}
                  onDismiss={() => updateStatus(rec.id, 'DISMISSED')}
                />
              ))}
            </div>
          )}

          {handled.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">Hanterade</h2>
              {handled.slice(0, 20).map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RecommendationCard({
  rec,
  onApply,
  onDismiss,
}: {
  rec: Recommendation;
  onApply?: () => void;
  onDismiss?: () => void;
}) {
  const savings = rec.current_price - rec.recommended_price;
  const isPending = rec.status === 'PENDING';

  return (
    <Card className={isPending ? '' : 'opacity-60'}>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingDown className="h-4 w-4 text-green-600 shrink-0" />
              <p className="font-medium text-sm break-words">
                {rec.product?.name || 'Okänd produkt'}
              </p>
              {rec.status === 'APPLIED' && (
                <Badge className="bg-green-100 text-green-800">Genomförd</Badge>
              )}
              {rec.status === 'DISMISSED' && (
                <Badge variant="secondary">Avfärdad</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{rec.reason}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              <span className="text-sm">
                <span className="text-muted-foreground">Nu:</span>{' '}
                <span className="font-medium">{rec.current_price.toLocaleString('sv-SE')} kr</span>
              </span>
              <span className="text-sm text-green-600 font-medium">
                → {rec.recommended_price.toLocaleString('sv-SE')} kr
              </span>
              <span className="text-xs text-muted-foreground">
                (Besparing: {savings.toLocaleString('sv-SE')} kr)
              </span>
              {rec.competitor && (
                <span className="text-xs text-muted-foreground">
                  vs {rec.competitor.name}
                </span>
              )}
            </div>
          </div>
          {isPending && onApply && onDismiss && (
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={onApply}>
                <Check className="h-4 w-4 mr-1" />
                Genomför
              </Button>
              <Button size="sm" variant="outline" onClick={onDismiss}>
                <X className="h-4 w-4 mr-1" />
                Avfärda
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
