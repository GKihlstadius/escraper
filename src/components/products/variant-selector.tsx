'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PriceHistoryChart } from './price-history-chart';

interface Variant {
  id: string;
  color: string | null;
  variant_name: string;
  image: string | null;
  prices: Array<{
    id: string;
    price: number;
    original_price: number | null;
    currency: string;
    in_stock: boolean;
    url: string;
    scraped_at: string;
    competitor: {
      id: string;
      name: string;
      color: string;
      is_own_store: boolean;
    } | null;
  }>;
}

interface Props {
  product: {
    id: string;
    name: string;
    variants: Variant[];
  };
}

export function VariantSelector({ product }: Props) {
  const variants = product.variants || [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const currentVariant = variants[selectedIdx];

  if (!currentVariant) {
    return <p className="text-muted-foreground">Inga varianter hittade.</p>;
  }

  // Get latest price per competitor
  const latestPrices = getLatestPricesPerCompetitor(currentVariant.prices);
  const lowestPrice = latestPrices.length
    ? Math.min(...latestPrices.map((p) => p.price))
    : null;

  return (
    <div className="space-y-6">
      {/* Variant selector */}
      {variants.length > 1 && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Färg/variant:</span>
          <Select
            value={String(selectedIdx)}
            onValueChange={(v) => setSelectedIdx(Number(v))}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variants.map((v, i) => (
                <SelectItem key={v.id} value={String(i)}>
                  {v.color || v.variant_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary">{variants.length} varianter</Badge>
        </div>
      )}

      {/* Price comparison table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Prisjämförelse</CardTitle>
        </CardHeader>
        <CardContent>
          {latestPrices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Butik</TableHead>
                  <TableHead className="text-right">Pris</TableHead>
                  <TableHead className="text-right">Ord. pris</TableHead>
                  <TableHead>Lager</TableHead>
                  <TableHead>Senast uppdaterad</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestPrices
                  .sort((a, b) => a.price - b.price)
                  .map((p) => {
                    const isLowest = p.price === lowestPrice;
                    const isOwn = p.competitor?.is_own_store;
                    return (
                      <TableRow
                        key={p.id}
                        className={isOwn ? 'bg-blue-50' : ''}
                      >
                        <TableCell className="font-medium">
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: p.competitor?.color || '#666' }}
                          />
                          {p.competitor?.name || 'Okänd'}
                          {isOwn && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Din butik
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${isLowest ? 'text-green-600' : ''}`}>
                          {p.price.toLocaleString('sv-SE')} kr
                          {isLowest && <span className="ml-1 text-xs">Lägst</span>}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {p.original_price
                            ? `${p.original_price.toLocaleString('sv-SE')} kr`
                            : '–'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.in_stock ? 'default' : 'destructive'}>
                            {p.in_stock ? 'I lager' : 'Slut'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(p.scraped_at).toLocaleDateString('sv-SE')}
                        </TableCell>
                        <TableCell>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Besök
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-6">Inga priser hittade.</p>
          )}
        </CardContent>
      </Card>

      {/* Price history chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Prishistorik (30 dagar)</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceHistoryChart prices={currentVariant.prices} />
        </CardContent>
      </Card>
    </div>
  );
}

function getLatestPricesPerCompetitor(prices: Variant['prices']) {
  const map = new Map<string, (typeof prices)[number]>();
  for (const p of prices) {
    const compId = p.competitor?.id || 'unknown';
    const existing = map.get(compId);
    if (!existing || new Date(p.scraped_at) > new Date(existing.scraped_at)) {
      map.set(compId, p);
    }
  }
  return [...map.values()];
}
