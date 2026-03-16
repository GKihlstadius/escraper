'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Search, X, SlidersHorizontal, Package } from 'lucide-react';
import Link from 'next/link';
import { CATEGORY_LABELS, CATEGORY_GROUPS, type ProductCategory } from '@/types';
import { AddProductDialog } from '@/components/products/add-product-dialog';

interface ProductWithVariants {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  image: string | null;
  variants: Array<{
    id: string;
    color: string | null;
    variant_name: string;
    image: string | null;
    prices: Array<{
      price: number;
      original_price: number | null;
      in_stock: boolean;
      competitor: { name: string; is_own_store: boolean } | null;
    }>;
  }>;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryGroup, setCategoryGroup] = useState<'alla' | 'barnvagnar' | 'bilstolar'>('alla');
  const [subCategory, setSubCategory] = useState<string>('alla');
  const [brandFilter, setBrandFilter] = useState<string>('alla');
  const [colorFilter, setColorFilter] = useState<string>('alla');
  const [stockFilter, setStockFilter] = useState<'alla' | 'i_lager' | 'slut'>('alla');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select(`
        id, name, brand, category, image,
        variants:product_variants(
          id, color, variant_name, image,
          prices:product_prices(
            price, original_price, in_stock,
            competitor:competitors(name, is_own_store)
          )
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // Show all active products that have at least one price
    const allProducts = (data || []) as unknown as ProductWithVariants[];
    const withPrices = allProducts.filter(p => {
      const allPrices = p.variants?.flatMap(v => v.prices || []) || [];
      return allPrices.length > 0;
    });
    setProducts(withPrices);
    setLoading(false);
  }

  // Extract unique brands and colors for filter dropdowns
  const brands = useMemo(() => {
    const set = new Set(products.map((p) => p.brand).filter(Boolean));
    return [...set].sort();
  }, [products]);

  const colors = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) =>
      p.variants?.forEach((v) => {
        if (v.color) set.add(v.color);
      })
    );
    return [...set].sort();
  }, [products]);

  const filtered = products.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
    }
    if (categoryGroup === 'barnvagnar' && !CATEGORY_GROUPS.barnvagnar.includes(p.category)) return false;
    if (categoryGroup === 'bilstolar' && !CATEGORY_GROUPS.bilstolar.includes(p.category)) return false;
    if (subCategory !== 'alla' && p.category !== subCategory) return false;
    if (brandFilter !== 'alla' && p.brand !== brandFilter) return false;
    if (colorFilter !== 'alla') {
      if (!p.variants?.some((v) => v.color === colorFilter)) return false;
    }
    if (stockFilter !== 'alla') {
      const hasInStock = p.variants?.some((v) => v.prices?.some((pr) => pr.in_stock));
      if (stockFilter === 'i_lager' && !hasInStock) return false;
      if (stockFilter === 'slut' && hasInStock) return false;
    }
    return true;
  });

  const activeFilterCount = [
    brandFilter !== 'alla',
    colorFilter !== 'alla',
    stockFilter !== 'alla',
    subCategory !== 'alla',
  ].filter(Boolean).length;

  function clearFilters() {
    setBrandFilter('alla');
    setColorFilter('alla');
    setStockFilter('alla');
    setSubCategory('alla');
    setCategoryGroup('alla');
    setSearch('');
  }

  const subCategories =
    categoryGroup === 'barnvagnar'
      ? CATEGORY_GROUPS.barnvagnar
      : categoryGroup === 'bilstolar'
        ? CATEGORY_GROUPS.bilstolar
        : ([...CATEGORY_GROUPS.barnvagnar, ...CATEGORY_GROUPS.bilstolar] as ProductCategory[]);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-[#6B7280] text-sm">{filtered.length} av {products.length} produkter</p>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-gradient-to-br from-[#7C3AED] to-[#EC4899] hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Lägg till
        </Button>
      </div>

      {/* Search + tabs + filter toggle */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" />
            <Input
              placeholder="Sök produkt eller varumärke..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-[#E5E7EB] rounded-xl"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-[#6B7280]" />
              </button>
            )}
          </div>
          <Tabs value={categoryGroup} onValueChange={(v) => { setCategoryGroup(v as typeof categoryGroup); setSubCategory('alla'); }}>
            <TabsList className="bg-white border border-[#E5E7EB]">
              <TabsTrigger value="alla">Alla</TabsTrigger>
              <TabsTrigger value="barnvagnar">Barnvagnar</TabsTrigger>
              <TabsTrigger value="bilstolar">Bilstolar</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={`border-[#E5E7EB] rounded-xl ${showFilters ? 'bg-[#7C3AED]/5 border-[#7C3AED]/30 text-[#7C3AED]' : ''}`}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filter
            {activeFilterCount > 0 && (
              <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center bg-[#7C3AED] text-white text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Extended filter dropdowns */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 bg-white rounded-xl border border-[#E5E7EB]">
            <Select value={subCategory} onValueChange={(v) => v && setSubCategory(v)}>
              <SelectTrigger className="w-full sm:w-44 rounded-xl border-[#E5E7EB]">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alla">Alla kategorier</SelectItem>
                {subCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={brandFilter} onValueChange={(v) => v && setBrandFilter(v)}>
              <SelectTrigger className="w-full sm:w-44 rounded-xl border-[#E5E7EB]">
                <SelectValue placeholder="Varumärke" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alla">Alla varumärken</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={colorFilter} onValueChange={(v) => v && setColorFilter(v)}>
              <SelectTrigger className="w-full sm:w-44 rounded-xl border-[#E5E7EB]">
                <SelectValue placeholder="Färg" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alla">Alla färger</SelectItem>
                {colors.map((color) => (
                  <SelectItem key={color} value={color}>{color}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stockFilter} onValueChange={(v) => v && setStockFilter(v as typeof stockFilter)}>
              <SelectTrigger className="w-full sm:w-44 rounded-xl border-[#E5E7EB]">
                <SelectValue placeholder="Lagerstatus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alla">Alla</SelectItem>
                <SelectItem value="i_lager">I lager</SelectItem>
                <SelectItem value="slut">Slut i lager</SelectItem>
              </SelectContent>
            </Select>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-[#6B7280] hover:text-red-600">
                <X className="h-4 w-4 mr-1" />
                Rensa filter
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse bg-white border-[#E5E7EB]">
              <CardContent className="pt-6 h-48" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-[#6B7280]/30 mx-auto mb-4" />
          <p className="text-[#6B7280] font-medium">Inga produkter hittade</p>
          <p className="text-sm text-[#6B7280]/70 mt-1">Justera dina filter eller kör en scraping.</p>
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
              Rensa filter
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <AddProductDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdded={loadProducts}
      />
    </div>
  );
}

function ProductCard({ product }: { product: ProductWithVariants }) {
  const [selectedVariant, setSelectedVariant] = useState(0);
  const variants = product.variants || [];
  const currentVariant = variants[selectedVariant] || variants[0];
  const prices = currentVariant?.prices || [];
  const uniqueColors = variants.filter((v) => v.color).map((v) => v.color!);

  const allPrices = prices.map((p) => p.price).filter((p) => p > 0);
  const lowestPrice = allPrices.length ? Math.min(...allPrices) : null;
  const ownPrice = prices.find((p) => p.competitor?.is_own_store)?.price;
  const inStock = prices.some((p) => p.in_stock);

  return (
    <Link href={`/products/${product.id}`}>
      <Card className="hover:shadow-md transition-all cursor-pointer h-full bg-white border-[#E5E7EB] hover:border-[#7C3AED]/30">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            {(currentVariant?.image || product.image) ? (
              <img
                src={currentVariant?.image || product.image || ''}
                alt={product.name}
                className="w-20 h-20 object-contain rounded-lg bg-[#F5F5F4] p-1"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-[#F5F5F4] flex items-center justify-center text-[#6B7280]/30">
                <Package className="w-8 h-8" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-[#111111] truncate">{product.name}</p>
              <p className="text-xs text-[#6B7280] mt-0.5">{product.brand}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-[#F5F5F4] text-[#6B7280]">
                  {CATEGORY_LABELS[product.category] || product.category}
                </Badge>
                {inStock ? (
                  <span className="text-[10px] text-green-600 font-medium">I lager</span>
                ) : (
                  <span className="text-[10px] text-red-500 font-medium">Slut</span>
                )}
              </div>
            </div>
          </div>

          {/* Color selector */}
          {uniqueColors.length > 1 && (
            <div className="mt-3">
              <Select value={String(selectedVariant)} onValueChange={(v) => setSelectedVariant(Number(v))}>
                <SelectTrigger className="h-8 text-xs rounded-lg border-[#E5E7EB]" onClick={(e) => e.preventDefault()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((v, i) => (
                    <SelectItem key={v.id} value={String(i)}>{v.color || v.variant_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[#6B7280] mt-1">{uniqueColors.length} färger</p>
            </div>
          )}

          {/* Price info */}
          <div className="mt-3 flex items-end justify-between">
            {lowestPrice !== null ? (
              <div>
                <p className="text-[10px] text-[#6B7280] uppercase tracking-wide">Lägsta pris</p>
                <p className="text-lg font-bold text-[#111111]">{lowestPrice.toLocaleString('sv-SE')} kr</p>
              </div>
            ) : (
              <p className="text-sm text-[#6B7280]">Inget pris</p>
            )}
            {ownPrice && (
              <div className="text-right">
                <p className="text-[10px] text-[#6B7280] uppercase tracking-wide">Ditt pris</p>
                <p className="text-sm font-semibold text-[#7C3AED]">{ownPrice.toLocaleString('sv-SE')} kr</p>
              </div>
            )}
          </div>

          <p className="text-[10px] text-[#6B7280] mt-2">
            {prices.length} butik{prices.length !== 1 ? 'er' : ''} · {variants.length} variant{variants.length !== 1 ? 'er' : ''}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
