-- ══════════════════════════════════════════════
-- Daily price snapshots for historical tracking
-- ══════════════════════════════════════════════

create table daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  file_name text not null,
  csv_data text not null,
  products_count int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_snapshots_date on daily_snapshots (snapshot_date desc);

-- RLS
alter table daily_snapshots enable row level security;
create policy "Authenticated read" on daily_snapshots for select to authenticated using (true);
