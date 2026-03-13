import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_LABELS, type ProductCategory } from '@/types';
import { ProductPriceTable } from '@/components/products/price-table';
import { PriceHistoryChart } from '@/components/products/price-history-chart';
import { VariantSelector } from '@/components/products/variant-selector';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from('products')
    .select(`
      id, name, brand, category, image, ean, gtin,
      variants:product_variants(
        id, color, variant_name, image,
        prices:product_prices(
          id, price, original_price, currency, in_stock, url, scraped_at,
          competitor:competitors(id, name, color, is_own_store)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        {product.image && (
          <img
            src={product.image}
            alt={product.name}
            className="w-32 h-32 object-contain rounded-lg border"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-muted-foreground">{product.brand}</p>
          <div className="flex gap-2 mt-2">
            <Badge>{CATEGORY_LABELS[product.category as ProductCategory] || product.category}</Badge>
            {product.ean && <Badge variant="outline">EAN: {product.ean}</Badge>}
          </div>
        </div>
      </div>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <VariantSelector product={product as any} />
    </div>
  );
}
