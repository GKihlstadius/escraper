// ── Core domain types ──

export type ProductCategory =
  | 'duovagn'
  | 'sittvagn'
  | 'joggingvagn'
  | 'vagnspaket'
  | 'liggvagn'
  | 'syskonvagn'
  | 'babyskydd'
  | 'bakatvänd_bilstol'
  | 'framåtvänd_bilstol'
  | 'bälteskudde'
  | 'bilstolspaket'
  | 'övrigt';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  duovagn: 'Duovagn',
  sittvagn: 'Sittvagn',
  joggingvagn: 'Joggingvagn',
  vagnspaket: 'Vagnspaket',
  liggvagn: 'Liggvagn',
  syskonvagn: 'Syskonvagn',
  babyskydd: 'Babyskydd',
  bakatvänd_bilstol: 'Bakåtvänd bilstol',
  framåtvänd_bilstol: 'Framåtvänd bilstol',
  bälteskudde: 'Bälteskudde',
  bilstolspaket: 'Bilstolspaket',
  övrigt: 'Övrigt',
};

export const CATEGORY_GROUPS = {
  barnvagnar: ['duovagn', 'sittvagn', 'joggingvagn', 'vagnspaket', 'liggvagn', 'syskonvagn'] as ProductCategory[],
  bilstolar: ['babyskydd', 'bakatvänd_bilstol', 'framåtvänd_bilstol', 'bälteskudde', 'bilstolspaket'] as ProductCategory[],
};

export interface Competitor {
  id: string;
  name: string;
  url: string;
  logo: string | null;
  color: string;
  is_own_store: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  normalized_name: string | null;
  brand: string;
  category: ProductCategory;
  sku: string | null;
  ean: string | null;
  gtin: string | null;
  image: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  product_id: string;
  color: string | null;
  size: string | null;
  variant_name: string;
  image: string | null;
  created_at: string;
  prices?: ProductPrice[];
}

export interface ProductPrice {
  id: string;
  variant_id: string;
  competitor_id: string;
  price: number;
  original_price: number | null;
  currency: string;
  in_stock: boolean;
  url: string;
  scraped_at: string;
  competitor?: Competitor;
}

export interface Alert {
  id: string;
  type: 'PRICE_DROP' | 'PRICE_INCREASE' | 'STOCK_CHANGE' | 'NEW_CAMPAIGN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  product_id: string | null;
  competitor_id: string | null;
  is_read: boolean;
  created_at: string;
  product?: Product;
  competitor?: Competitor;
}

export interface PriceRecommendation {
  id: string;
  product_id: string;
  variant_id: string | null;
  competitor_id: string | null;
  current_price: number;
  recommended_price: number;
  reason: string;
  status: 'PENDING' | 'APPLIED' | 'DISMISSED';
  created_at: string;
  product?: Product;
  competitor?: Competitor;
}

export interface ScrapingLog {
  id: string;
  competitor_id: string;
  status: 'SUCCESS' | 'ERROR' | 'RUNNING';
  message: string;
  products_scraped: number;
  duration_ms: number;
  created_at: string;
}

export interface DashboardStats {
  total_products: number;
  total_competitors: number;
  active_campaigns: number;
  unread_alerts: number;
  last_scrape: string | null;
  products_with_price_drop: number;
}
