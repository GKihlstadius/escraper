'use client';

import { useState, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { ExternalLink } from 'lucide-react';

// ── Store colors (fallback palette) ──
const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316',
];

type CompetitorInfo = { id: string; name: string; isOwn: boolean; color: string };
type ProductInfo = { id: string; name: string; brand: string; storeCount?: number };

export function ProductPriceComparison({
  products,
  competitors,
  prices,
  urls,
  ownStoreIds,
}: {
  products: ProductInfo[];
  competitors: CompetitorInfo[];
  prices: Record<string, Record<string, Record<string, number>>>;
  urls: Record<string, Record<string, string>>;
  ownStoreIds?: string[];
}) {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ownIds = useMemo(() => new Set(ownStoreIds || competitors.filter(c => c.isOwn).map(c => c.id)), [ownStoreIds, competitors]);

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    );
  }, [products, search]);

  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Build chart data for selected product
  const { chartData, activeCompetitors } = useMemo(() => {
    const productPrices = prices[selectedProductId];
    if (!productPrices) return { chartData: [], activeCompetitors: [] };

    const allDates = new Set<string>();
    for (const dateMap of Object.values(productPrices)) {
      for (const date of Object.keys(dateMap)) allDates.add(date);
    }
    const sortedDates = [...allDates].sort();

    const active = competitors.filter(c => productPrices[c.id]);

    const data = sortedDates.map(date => {
      const row: Record<string, string | number> = { date: date.slice(5) };
      for (const comp of active) {
        const price = productPrices[comp.id]?.[date];
        if (price !== undefined) row[comp.name] = price;
      }
      return row;
    });

    return { chartData: data, activeCompetitors: active };
  }, [selectedProductId, prices, competitors]);

  // URLs for current product's competitors
  const currentUrls = useMemo(() => {
    const productUrls = urls[selectedProductId] || {};
    const map = new Map<string, string>();
    for (const comp of activeCompetitors) {
      if (productUrls[comp.id]) map.set(comp.name, productUrls[comp.id]);
    }
    return map;
  }, [selectedProductId, urls, activeCompetitors]);

  // Assign colors: own stores = violet, others = palette
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const comp of activeCompetitors) {
      if (comp.isOwn) {
        map.set(comp.name, '#8b5cf6');
      } else {
        map.set(comp.name, PALETTE[idx % PALETTE.length]);
        idx++;
      }
    }
    return map;
  }, [activeCompetitors]);

  // Price summary for selected product: own price vs cheapest competitor
  const priceSummary = useMemo(() => {
    const productPrices = prices[selectedProductId];
    if (!productPrices) return null;

    // Get the latest price for each competitor
    let ownPrice: number | null = null;
    let ownName = '';
    let cheapestComp: number | null = null;
    let cheapestName = '';

    for (const comp of activeCompetitors) {
      const dateMap = productPrices[comp.id];
      if (!dateMap) continue;
      const dates = Object.keys(dateMap).sort();
      const latest = dates[dates.length - 1];
      if (!latest) continue;
      const price = dateMap[latest];

      if (ownIds.has(comp.id)) {
        if (ownPrice === null || price < ownPrice) {
          ownPrice = price;
          ownName = comp.name;
        }
      } else {
        if (cheapestComp === null || price < cheapestComp) {
          cheapestComp = price;
          cheapestName = comp.name;
        }
      }
    }

    if (ownPrice === null || cheapestComp === null) return null;

    const diff = ownPrice - cheapestComp;
    const pct = ((diff / cheapestComp) * 100).toFixed(1);

    return { ownPrice, ownName, cheapestComp, cheapestName, diff, pct };
  }, [selectedProductId, prices, activeCompetitors, ownIds]);

  if (!products.length) {
    return (
      <div className="h-[300px] flex items-center justify-center text-sm text-zinc-400">
        Ingen produktdata med jämförbara priser
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 sm:gap-4">
        <h2 className="text-sm font-medium shrink-0">Prisjämförelse</h2>

        {/* Product search */}
        <div className="relative w-full sm:max-w-sm">
          <input
            type="text"
            placeholder="Sök produkt..."
            value={open ? search : (selectedProduct ? `${selectedProduct.brand} ${selectedProduct.name}` : '')}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => { setOpen(true); setSearch(''); }}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="w-full h-10 sm:h-8 px-3 sm:px-2.5 text-sm rounded-lg border border-zinc-200 bg-white outline-none focus:border-zinc-400 transition-colors"
          />
          {open && (
            <div className="absolute z-50 top-full mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-zinc-400">Inga träffar</div>
              ) : (
                <>
                  <div className="px-3 py-1.5 text-[11px] text-zinc-400 border-b border-zinc-100">
                    {filtered.length} produkter
                  </div>
                  {filtered.slice(0, 80).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setSearch('');
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-3 sm:py-2 text-sm hover:bg-zinc-50 transition-colors flex items-center justify-between ${
                        p.id === selectedProductId ? 'bg-zinc-50 font-medium' : ''
                      }`}
                    >
                      <span>
                        <span className="text-zinc-400 mr-1">{p.brand}</span>
                        {p.name}
                      </span>
                      {p.storeCount !== undefined && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ml-2 ${
                          p.storeCount >= 3 ? 'bg-emerald-50 text-emerald-600' :
                          p.storeCount >= 2 ? 'bg-blue-50 text-blue-600' :
                          'bg-zinc-50 text-zinc-400'
                        }`}>
                          {p.storeCount} {p.storeCount === 1 ? 'butik' : 'butiker'}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legend with clickable store links */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
        {activeCompetitors.map(comp => {
          const url = currentUrls.get(comp.name);
          const inner = (
            <>
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: colorMap.get(comp.name) }}
              />
              <span className={comp.isOwn ? 'font-semibold text-zinc-700' : ''}>
                {comp.name}
              </span>
              {url && <ExternalLink className="h-3 w-3 text-zinc-300 group-hover:text-zinc-500 transition-colors" />}
            </>
          );

          return url ? (
            <a
              key={comp.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              {inner}
            </a>
          ) : (
            <span key={comp.id} className="flex items-center gap-1.5 text-xs text-zinc-500">
              {inner}
            </span>
          );
        })}
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toLocaleString()} kr`}
              domain={['dataMin - 100', 'dataMax + 100']}
            />
            <Tooltip content={<ComparisonTooltip colorMap={colorMap} urlMap={currentUrls} />} />
            {activeCompetitors.map(comp => (
              <Line
                key={comp.id}
                type="monotone"
                dataKey={comp.name}
                stroke={colorMap.get(comp.name)}
                strokeWidth={comp.isOwn ? 2.5 : 1.5}
                strokeDasharray={comp.isOwn ? undefined : '5 5'}
                dot={false}
                activeDot={{ r: comp.isOwn ? 5 : 3, strokeWidth: 0 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[280px] flex items-center justify-center text-sm text-zinc-400">
          Ingen prisdata för vald produkt
        </div>
      )}

      {/* Price summary */}
      {priceSummary && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-100">
            <span className="text-violet-500">Vårt pris</span>
            <span className="font-semibold text-violet-700 tabular-nums">
              {Math.round(priceSummary.ownPrice).toLocaleString()} kr
            </span>
            <span className="text-violet-400">({priceSummary.ownName})</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100">
            <span className="text-zinc-400">Billigast konkurrent</span>
            <span className="font-semibold text-zinc-700 tabular-nums">
              {Math.round(priceSummary.cheapestComp).toLocaleString()} kr
            </span>
            <span className="text-zinc-400">({priceSummary.cheapestName})</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
            priceSummary.diff <= 0
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : 'bg-red-50 border-red-100 text-red-700'
          }`}>
            <span>{priceSummary.diff <= 0 ? 'Vi är billigare' : 'Vi är dyrare'}</span>
            <span className="font-semibold tabular-nums">
              {priceSummary.diff <= 0 ? '' : '+'}{Math.round(priceSummary.diff).toLocaleString()} kr ({priceSummary.pct}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonTooltip({
  active, payload, label, colorMap, urlMap,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; name: string }>;
  label?: string;
  colorMap: Map<string, string>;
  urlMap: Map<string, string>;
}) {
  if (!active || !payload?.length) return null;

  const sorted = [...payload].sort((a, b) => a.value - b.value);

  return (
    <div className="rounded-md bg-white/95 backdrop-blur px-3 py-2 shadow-md border text-xs">
      <p className="text-[11px] text-zinc-400 mb-1.5">{label}</p>
      {sorted.map((p) => {
        const url = urlMap.get(p.dataKey);
        const row = (
          <>
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: colorMap.get(p.dataKey) || '#999' }}
            />
            <span className="text-zinc-500 truncate">{p.dataKey}</span>
            {url && <ExternalLink className="h-2.5 w-2.5 text-zinc-300 shrink-0" />}
            <span className="font-medium ml-auto tabular-nums">
              {Math.round(p.value).toLocaleString()} kr
            </span>
          </>
        );

        return url ? (
          <a
            key={p.dataKey}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 py-0.5 hover:text-zinc-700 transition-colors cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            {row}
          </a>
        ) : (
          <p key={p.dataKey} className="flex items-center gap-2 py-0.5">
            {row}
          </p>
        );
      })}
    </div>
  );
}

// ── Overall Price History Chart ──
export function PriceHistoryChart({ data }: {
  data: { date: string; avg: number; min: number }[];
}) {
  if (!data.length) {
    return (
      <div className="h-[300px] flex items-center justify-center text-sm text-zinc-400">
        Ingen prisdata ännu
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#a1a1aa' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#a1a1aa' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`}
          domain={['dataMin - 500', 'dataMax + 500']}
        />
        <Tooltip content={<OverviewTooltip />} />
        <Area
          type="monotone"
          dataKey="avg"
          stroke="#8b5cf6"
          strokeWidth={2}
          fill="url(#grad)"
          dot={false}
          activeDot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="min"
          stroke="#10b981"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          fill="none"
          dot={false}
          activeDot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function OverviewTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-white/95 backdrop-blur px-3 py-2 shadow-md border text-xs">
      <p className="text-[11px] text-zinc-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: p.dataKey === 'avg' ? '#8b5cf6' : '#10b981' }}
          />
          <span className="text-zinc-500">{p.dataKey === 'avg' ? 'Snittpris' : 'Lägsta'}</span>
          <span className="font-medium ml-auto">{Math.round(p.value).toLocaleString()} kr</span>
        </p>
      ))}
    </div>
  );
}
