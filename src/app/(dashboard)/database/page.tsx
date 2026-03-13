'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Download, Calendar, FileSpreadsheet, Loader2 } from 'lucide-react';

interface Snapshot {
  id: string;
  snapshot_date: string;
  file_name: string;
  products_count: number;
  created_at: string;
}

export default function DatabasePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSnapshots();
  }, []);

  async function loadSnapshots() {
    const supabase = createClient();
    const { data } = await supabase
      .from('daily_snapshots')
      .select('id, snapshot_date, file_name, products_count, created_at')
      .order('snapshot_date', { ascending: false })
      .limit(90);
    setSnapshots(data || []);
    setLoading(false);
  }

  async function downloadSnapshot(id: string, fileName: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('daily_snapshots')
      .select('csv_data')
      .eq('id', id)
      .single();

    if (!data?.csv_data) return;

    const blob = new Blob(['\uFEFF' + data.csv_data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('sv-SE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // Group snapshots by month
  const grouped = snapshots.reduce<Record<string, Snapshot[]>>((acc, s) => {
    const month = s.snapshot_date.slice(0, 7); // YYYY-MM
    if (!acc[month]) acc[month] = [];
    acc[month].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-zinc-100 p-5">
        <div className="flex items-center gap-3 mb-1">
          <FileSpreadsheet className="h-5 w-5 text-violet-500" />
          <h2 className="text-sm font-medium text-zinc-900">Dagliga prisrapporter</h2>
        </div>
        <p className="text-xs text-zinc-400 ml-8">
          Varje dag kl 16:00 sparas en komplett prisrapport automatiskt. Ladda ner för att jämföra historiska priser.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-20">
          <Calendar className="h-8 w-8 text-zinc-200 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Inga rapporter sparade ännu.</p>
          <p className="text-xs text-zinc-300 mt-1">Första rapporten genereras automatiskt kl 16:00.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([month, items]) => {
            const monthDate = new Date(month + '-01');
            const monthLabel = monthDate.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long' });

            return (
              <div key={month}>
                <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-medium mb-3 capitalize">
                  {monthLabel}
                </h3>
                <div className="bg-white rounded-xl border border-zinc-100 divide-y divide-zinc-50">
                  {items.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-zinc-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="h-4 w-4 text-violet-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-700 capitalize truncate">{formatDate(snapshot.snapshot_date)}</p>
                          <p className="text-xs text-zinc-400">{snapshot.products_count} produkter</p>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadSnapshot(snapshot.id, snapshot.file_name)}
                        className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Ladda ner</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
