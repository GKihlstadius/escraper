'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Download } from 'lucide-react';

export function ExportButton() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const supabase = createClient();

      // Fetch today's data
      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const [{ data: prices }, { data: products }, { data: variants }, { data: competitors }] = await Promise.all([
        supabase
          .from('product_prices')
          .select('variant_id, competitor_id, price, original_price, in_stock, url, scraped_at')
          .gte('scraped_at', since.toISOString())
          .order('scraped_at', { ascending: false }),
        supabase.from('products').select('id, name, brand, category').eq('is_active', true),
        supabase.from('product_variants').select('id, product_id, variant_name, color'),
        supabase.from('competitors').select('id, name, is_own_store').eq('is_active', true),
      ]);

      if (!prices?.length) {
        alert('Ingen prisdata att exportera');
        setLoading(false);
        return;
      }

      const productMap = new Map((products || []).map(p => [p.id, p]));
      const variantMap = new Map((variants || []).map(v => [v.id, v]));
      const competitorMap = new Map((competitors || []).map(c => [c.id, c]));

      // Build CSV
      const headers = [
        'Datum',
        'Produkt',
        'Varumärke',
        'Kategori',
        'Variant',
        'Butik',
        'Egen butik',
        'Pris',
        'Ordinarie pris',
        'I lager',
        'URL',
      ];

      const rows = prices.map(p => {
        const variant = variantMap.get(p.variant_id);
        const product = variant ? productMap.get(variant.product_id) : null;
        const competitor = competitorMap.get(p.competitor_id);

        return [
          p.scraped_at?.slice(0, 10) || '',
          product?.name || '',
          product?.brand || '',
          product?.category || '',
          variant?.variant_name || variant?.color || '',
          competitor?.name || '',
          competitor?.is_own_store ? 'Ja' : 'Nej',
          p.price,
          p.original_price || '',
          p.in_stock ? 'Ja' : 'Nej',
          p.url || '',
        ];
      });

      const csvContent = [
        headers.join(';'),
        ...rows.map(row =>
          row.map(cell => {
            const str = String(cell);
            return str.includes(';') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          }).join(';')
        ),
      ].join('\n');

      // Add BOM for Excel UTF-8 support
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prisdata-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export misslyckades');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border border-zinc-100 text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
    >
      <span className="flex items-center gap-2">
        <Download className="h-3.5 w-3.5" />
        {loading ? 'Exporterar...' : 'Exportera dagsdata'}
      </span>
    </button>
  );
}
