'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, subDays, isAfter } from 'date-fns';

interface PriceEntry {
  price: number;
  scraped_at: string;
  competitor: {
    id: string;
    name: string;
    color: string;
    is_own_store: boolean;
  } | null;
}

interface Props {
  prices: PriceEntry[];
}

export function PriceHistoryChart({ prices }: Props) {
  const thirtyDaysAgo = subDays(new Date(), 30);
  const recentPrices = prices.filter(
    (p) => isAfter(new Date(p.scraped_at), thirtyDaysAgo)
  );

  if (recentPrices.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-6">
        Ingen prishistorik ännu.
      </p>
    );
  }

  // Get unique competitors
  const competitors = new Map<string, { name: string; color: string }>();
  for (const p of recentPrices) {
    if (p.competitor) {
      competitors.set(p.competitor.id, {
        name: p.competitor.name,
        color: p.competitor.color,
      });
    }
  }

  // Build chart data: group by date
  const dateMap = new Map<string, Record<string, number>>();
  for (const p of recentPrices) {
    const date = format(new Date(p.scraped_at), 'yyyy-MM-dd');
    const compId = p.competitor?.id || 'unknown';
    const existing = dateMap.get(date) || {};
    // Keep latest price per competitor per day
    existing[compId] = p.price;
    dateMap.set(date, existing);
  }

  const chartData = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: format(new Date(date), 'dd MMM'),
      ...values,
    }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v: number) => `${v} kr`} />
        <Tooltip formatter={(value: number) => `${value} kr`} />
        <Legend />
        {[...competitors.entries()].map(([id, comp]) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={comp.name}
            stroke={comp.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
