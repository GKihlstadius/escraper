-- ══════════════════════════════════════════════
-- E-Scraper v2 — Initial Schema
-- ══════════════════════════════════════════════

-- Enums
create type product_category as enum (
  'duovagn', 'sittvagn', 'joggingvagn', 'vagnspaket',
  'liggvagn', 'syskonvagn',
  'babyskydd', 'bakatvänd_bilstol', 'framåtvänd_bilstol',
  'bälteskudde', 'bilstolspaket', 'övrigt'
);

create type alert_type as enum (
  'PRICE_DROP', 'PRICE_INCREASE', 'STOCK_CHANGE', 'NEW_CAMPAIGN'
);

create type alert_severity as enum (
  'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
);

create type scraping_status as enum (
  'SUCCESS', 'ERROR', 'RUNNING'
);

create type recommendation_status as enum (
  'PENDING', 'APPLIED', 'DISMISSED'
);

-- ── Competitors ──
create table competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  logo text,
  color text not null default '#666666',
  is_own_store boolean not null default false,
  is_active boolean not null default true,
  sitemap_url text,
  created_at timestamptz not null default now()
);

-- ── Products ──
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text,
  brand text not null default 'Okänt',
  category product_category not null default 'övrigt',
  sku text,
  ean text,
  gtin text,
  image text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_brand on products (brand);
create index idx_products_category on products (category);
create index idx_products_normalized_name on products (normalized_name);
create index idx_products_ean on products (ean) where ean is not null;
create index idx_products_gtin on products (gtin) where gtin is not null;

-- ── Product Variants (color/size grouping) ──
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  color text,
  size text,
  variant_name text not null,
  image text,
  created_at timestamptz not null default now()
);

create index idx_variants_product on product_variants (product_id);

-- ── Product Prices (per variant per competitor) ──
create table product_prices (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  price numeric(10,2) not null,
  original_price numeric(10,2),
  currency text not null default 'SEK',
  in_stock boolean not null default true,
  url text not null,
  scraped_at timestamptz not null default now()
);

create index idx_prices_variant on product_prices (variant_id);
create index idx_prices_competitor on product_prices (competitor_id);
create index idx_prices_scraped on product_prices (scraped_at desc);
create index idx_prices_variant_competitor_recent on product_prices (variant_id, competitor_id, scraped_at desc);

-- ── Alerts ──
create table alerts (
  id uuid primary key default gen_random_uuid(),
  type alert_type not null,
  severity alert_severity not null default 'MEDIUM',
  title text not null,
  message text not null,
  product_id uuid references products(id) on delete set null,
  competitor_id uuid references competitors(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_alerts_unread on alerts (is_read, created_at desc) where not is_read;
create index idx_alerts_product on alerts (product_id) where product_id is not null;

-- ── Price Recommendations ──
create table price_recommendations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null,
  competitor_id uuid references competitors(id) on delete set null,
  current_price numeric(10,2) not null,
  recommended_price numeric(10,2) not null,
  reason text not null,
  status recommendation_status not null default 'PENDING',
  created_at timestamptz not null default now()
);

create index idx_recommendations_status on price_recommendations (status, created_at desc);

-- ── Scraping Logs ──
create table scraping_logs (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  status scraping_status not null,
  message text not null default '',
  products_scraped int not null default 0,
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_scraping_logs_recent on scraping_logs (created_at desc);

-- ── Product Matches (cross-competitor matching) ──
create table product_matches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  matched_name text not null,
  matched_brand text,
  match_score numeric(4,2) not null default 0,
  method text not null default 'FUZZY_NAME',
  source_url text,
  created_at timestamptz not null default now()
);

create index idx_matches_product on product_matches (product_id);

-- ── Updated at trigger ──
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

-- ── Row Level Security ──
alter table competitors enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_prices enable row level security;
alter table alerts enable row level security;
alter table price_recommendations enable row level security;
alter table scraping_logs enable row level security;
alter table product_matches enable row level security;

-- Policies: authenticated users can read all data
create policy "Authenticated read" on competitors for select to authenticated using (true);
create policy "Authenticated read" on products for select to authenticated using (true);
create policy "Authenticated read" on product_variants for select to authenticated using (true);
create policy "Authenticated read" on product_prices for select to authenticated using (true);
create policy "Authenticated read" on alerts for select to authenticated using (true);
create policy "Authenticated read" on price_recommendations for select to authenticated using (true);
create policy "Authenticated read" on scraping_logs for select to authenticated using (true);
create policy "Authenticated read" on product_matches for select to authenticated using (true);

-- Authenticated users can update alerts (mark as read) and recommendations (apply/dismiss)
create policy "Authenticated update alerts" on alerts for update to authenticated using (true);
create policy "Authenticated update recommendations" on price_recommendations for update to authenticated using (true);

-- Service role (API routes) can do everything via service_role key (bypasses RLS)

-- ── Seed: Competitors ──
insert into competitors (name, url, color, is_own_store, sitemap_url) values
  ('KöpBarnvagn', 'https://www.kopbarnvagn.se', '#2563eb', true, 'https://www.kopbarnvagn.se/sitemap.xml'),
  ('Bonti', 'https://www.bonti.se', '#059669', true, 'https://bonti.se/sitemap.xml'),
  ('Jollyroom', 'https://www.jollyroom.se', '#dc2626', false, 'https://www.jollyroom.se/sitemap.axd'),
  ('Babyland', 'https://www.babyland.se', '#7c3aed', false, 'https://www.babyland.se/Sitemap/SMPViewAACC'),
  ('BabySam', 'https://www.babysam.se', '#ea580c', false, 'https://www.babysam.se/sitemap-1-products.xml'),
  ('Pyret & Snäckan', 'https://www.pyretosnackan.se', '#0891b2', false, 'https://www.pyretosnackan.se/sitemap.axd'),
  ('BabyV', 'https://www.babyv.se', '#be185d', false, 'https://www.babyv.se/sitemap.xml'),
  ('My Baby', 'https://www.mybaby.se', '#4f46e5', false, null);
