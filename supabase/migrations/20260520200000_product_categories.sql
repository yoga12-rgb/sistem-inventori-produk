-- =========================================================================
--  Master kategori produk
--
--  Catatan: tiap produk = satu kategori. Kolom category_id di products
--  nullable agar produk lama bisa migrasi gradual (Super Admin update
--  manual). Bucket "Tanpa kategori" akan ditampilkan di UI sebagai NULL.
-- =========================================================================

create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                         -- mis. "pastry"
  name        text not null,                                -- mis. "Pastry"
  icon        text,                                          -- emoji atau identifier ikon
  color       text,                                          -- hex color, mis. "#f97316"
  sort        integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.product_categories is
  'Master kategori produk. Tiap produk boleh punya 0/1 kategori.';

create trigger trg_product_categories_updated
  before update on public.product_categories
  for each row execute function public.tg_set_updated_at();

create index idx_product_categories_active_sort
  on public.product_categories(sort, name) where is_active;

-- ---------- Tambah kolom category_id ke products ------------------------
alter table public.products
  add column category_id uuid references public.product_categories(id)
    on delete set null;

create index idx_products_category on public.products(category_id);

-- ---------- RLS ---------------------------------------------------------
alter table public.product_categories enable row level security;

-- Semua user authenticated boleh read (kasir butuh untuk filter UI).
create policy "categories_read_all_auth"
  on public.product_categories for select
  to authenticated using (true);

-- Hanya super admin yang menulis.
create policy "categories_super_admin_insert"
  on public.product_categories for insert
  to authenticated with check (public.is_super_admin());

create policy "categories_super_admin_update"
  on public.product_categories for update
  to authenticated using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "categories_super_admin_delete"
  on public.product_categories for delete
  to authenticated using (public.is_super_admin());

-- ---------- Realtime publication ----------------------------------------
alter publication supabase_realtime add table public.product_categories;
