'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Check, CheckCheck, ExternalLink, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  product_id: string | null;
  competitor_id: string | null;
}

interface ProductPrice {
  url: string;
  competitor_id: string;
}

const TYPE_LABELS: Record<string, string> = {
  PRICE_DROP: 'Prissänkning',
  PRICE_INCREASE: 'Prishöjning',
  STOCK_CHANGE: 'Lager',
  NEW_CAMPAIGN: 'Kampanj',
};

const TYPE_COLORS: Record<string, string> = {
  PRICE_DROP: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PRICE_INCREASE: 'bg-red-50 text-red-700 border-red-200',
  STOCK_CHANGE: 'bg-blue-50 text-blue-700 border-blue-200',
  NEW_CAMPAIGN: 'bg-amber-50 text-amber-700 border-amber-200',
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const BORDER_COLORS: Record<string, string> = {
  PRICE_DROP: 'border-l-emerald-500',
  PRICE_INCREASE: 'border-l-red-500',
  STOCK_CHANGE: 'border-l-blue-500',
  NEW_CAMPAIGN: 'border-l-amber-500',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('alla');
  const [severityFilter, setSeverityFilter] = useState('alla');
  // Map: productId+competitorId -> external URL
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    const supabase = createClient();

    // Fetch alerts
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    const alertData = (data || []) as Alert[];
    setAlerts(alertData);

    // Fetch URLs for alerts that have product_id + competitor_id
    const productCompPairs = alertData
      .filter(a => a.product_id && a.competitor_id)
      .map(a => ({ pid: a.product_id!, cid: a.competitor_id! }));

    if (productCompPairs.length > 0) {
      const productIds = [...new Set(productCompPairs.map(p => p.pid))];

      // Get variant IDs for these products
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id, product_id')
        .in('product_id', productIds);

      if (variants?.length) {
        const variantIds = variants.map(v => v.id);
        const variantToProduct = new Map(variants.map(v => [v.id, v.product_id]));

        // Get latest prices with URLs
        const { data: prices } = await supabase
          .from('product_prices')
          .select('variant_id, competitor_id, url')
          .in('variant_id', variantIds)
          .order('scraped_at', { ascending: false });

        const map = new Map<string, string>();
        for (const p of prices || []) {
          const productId = variantToProduct.get(p.variant_id);
          if (!productId || !p.url) continue;
          const key = `${productId}:${p.competitor_id}`;
          if (!map.has(key)) map.set(key, p.url);
        }
        setUrlMap(map);
      }
    }

    setLoading(false);
  }

  async function markAsRead(id: string) {
    const supabase = createClient();
    await supabase.from('alerts').update({ is_read: true }).eq('id', id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  }

  async function markAllAsRead() {
    const supabase = createClient();
    const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unreadIds.length === 0) return;
    await supabase.from('alerts').update({ is_read: true }).in('id', unreadIds);
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  }

  const filtered = alerts.filter((a) => {
    if (typeFilter !== 'alla' && a.type !== typeFilter) return false;
    if (severityFilter !== 'alla' && a.severity !== severityFilter) return false;
    return true;
  });

  const unreadCount = alerts.filter((a) => !a.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Larm</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} olästa` : 'Alla lästa'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Markera alla som lästa
          </Button>
        )}
      </div>

      <div className="flex gap-4">
        <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla typer</SelectItem>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => v && setSeverityFilter(v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Allvarlighet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla nivåer</SelectItem>
            <SelectItem value="CRITICAL">Kritisk</SelectItem>
            <SelectItem value="HIGH">Hög</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Låg</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6 h-20" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Inga larm matchar filtret.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => {
            const externalUrl = alert.product_id && alert.competitor_id
              ? urlMap.get(`${alert.product_id}:${alert.competitor_id}`)
              : null;

            return (
              <Card
                key={alert.id}
                className={`${alert.is_read ? 'opacity-60' : `border-l-4 ${BORDER_COLORS[alert.type] || 'border-l-blue-500'}`}`}
              >
                <CardContent className="pt-4 pb-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={TYPE_COLORS[alert.type] || 'bg-gray-100 text-gray-700'}>
                        {TYPE_LABELS[alert.type] || alert.type}
                      </Badge>
                      <Badge className={SEVERITY_COLORS[alert.severity]}>
                        {alert.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(alert.created_at).toLocaleString('sv-SE')}
                      </span>
                    </div>
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>

                    {/* Links */}
                    <div className="flex items-center gap-3 mt-2">
                      {alert.product_id && (
                        <Link
                          href={`/products/${alert.product_id}`}
                          className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 transition-colors"
                        >
                          Visa produkt
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                      {externalUrl && (
                        <a
                          href={externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                        >
                          Öppna i butik
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {!alert.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead(alert.id)}
                      className="shrink-0"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
