-- Add model_key column for cross-store product matching
alter table products add column if not exists model_key text;
create index if not exists idx_products_model_key on products (model_key) where model_key is not null;

-- Update My Baby sitemap URL (was null)
update competitors set sitemap_url = 'https://www.mybaby.se/sitemap.xml' where name = 'My Baby' and sitemap_url is null;
