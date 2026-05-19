-- =========================================================================
--  Sistem Inventaris Multi-Outlet â€” Initial Schema
--  Migration: init_schema
--
--  Concepts:
--   * Catalog terpusat (master products) â€” tiap varian = produk independen.
--   * Lokasi (outlets) terdiri atas Central Pastry + cabang.
--   * Stok dilacak per-batch (tanggal produksi, expiry, qty awal/sisa).
--   * Pemotongan FIFO otomatis dengan opsi manual override.
--   * Transfer mendukung dua mode: TWO_WAY (perlu konfirmasi) & ONE_WAY.
-- =========================================================================

-- ---------- ENUMS --------------------------------------------------------
create type user_role as enum ('super_admin', 'cashier');

create type location_type as enum ('central_kitchen', 'outlet');

create type stock_movement_type as enum (
  'production_in',   -- batch baru dari produksi (di Central Pastry)
  'entry_in',        -- pemasukan stok non-perishable (kemasan, dll.)
  'sale_out',        -- pengurangan dari penjualan
  'expired_out',     -- pembuangan karena kedaluwarsa
  'damage_out',      -- pengurangan karena rusak / waste
  'adjustment_in',   -- penyesuaian stok positif manual
  'adjustment_out',  -- penyesuaian stok negatif manual
  'transfer_out',    -- batch keluar untuk transfer
  'transfer_in'      -- batch masuk dari transfer
);

create type transfer_mode as enum ('one_way', 'two_way');

create type transfer_status as enum (
  'pending',     -- two_way: menunggu konfirmasi penerima
  'in_transit',  -- two_way: sudah dikirim, belum diterima
  'received',    -- selesai (sudah masuk stok tujuan)
  'cancelled',   -- dibatalkan oleh pengirim sebelum diterima
  'rejected'     -- ditolak oleh penerima (two_way)
);

-- ---------- CORE TABLES --------------------------------------------------

-- Lokasi (Central Pastry + Outlet)
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- misal: "CK01", "OUT-JKT"
  name            text not null,
  type            location_type not null default 'outlet',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.locations is 'Master lokasi: Central Pastry (produksi) dan outlet (cabang).';

-- Profil pengguna (extends auth.users)
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  role            user_role not null default 'cashier',
  outlet_id       uuid references public.locations(id) on delete restrict,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Kasir wajib memiliki outlet, super_admin tidak harus
  constraint profile_cashier_needs_outlet
    check (role <> 'cashier' or outlet_id is not null)
);

comment on column public.profiles.outlet_id is 'Outlet yang dipegang oleh kasir (untuk hak transfer).';

-- Master produk (tiap varian = baris independen, punya SKU sendiri)
create table public.products (
  id                       uuid primary key default gen_random_uuid(),
  sku                      text not null unique,
  name                     text not null,
  unit                     text not null default 'pcs',           -- contoh: pcs, box, kg
  is_perishable            boolean not null default true,
  -- Default shelf life dalam jam (nullable untuk non-perishable).
  -- Bisa di-override per batch saat input produksi.
  default_shelf_life_hours integer,
  -- Threshold warning expired (jam sebelum expired) - default 24 jam.
  expiry_warning_hours     integer not null default 24,
  -- Saran diskon otomatis dalam persen ketika mendekati expired.
  expiry_discount_percent  numeric(5,2) not null default 0,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint perishable_needs_shelf_life
    check (is_perishable = false or default_shelf_life_hours is not null),
  constraint shelf_life_positive
    check (default_shelf_life_hours is null or default_shelf_life_hours > 0)
);

-- Batch stok (granularitas inventaris).
-- Satu batch = satu kombinasi produk + lokasi + tanggal produksi (atau entry).
create table public.stock_batches (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete restrict,
  location_id     uuid not null references public.locations(id) on delete restrict,
  -- Untuk perishable: produced_at = waktu produksi.
  -- Untuk non-perishable: produced_at = waktu pemasukan stok.
  produced_at     timestamptz not null default now(),
  -- Hanya diisi untuk produk perishable.
  expires_at      timestamptz,
  initial_qty     numeric(14,3) not null check (initial_qty >= 0),
  remaining_qty   numeric(14,3) not null check (remaining_qty >= 0),
  -- Asal batch â€” null untuk produksi awal, terisi untuk hasil transfer.
  source_batch_id uuid references public.stock_batches(id) on delete set null,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint remaining_lte_initial check (remaining_qty <= initial_qty)
);

-- Log pergerakan stok â€” sumber kebenaran untuk laporan harian.
create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.stock_batches(id) on delete restrict,
  product_id      uuid not null references public.products(id) on delete restrict,
  location_id     uuid not null references public.locations(id) on delete restrict,
  movement_type   stock_movement_type not null,
  quantity        numeric(14,3) not null check (quantity > 0),
  occurred_at     timestamptz not null default now(),
  -- Polymorphic reference ke entitas asal (sale_id, transfer_id, dll).
  reference_type  text,
  reference_id    uuid,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Transaksi penjualan (header + lines).
create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations(id) on delete restrict,
  occurred_at     timestamptz not null default now(),
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.sale_items (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references public.sales(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete restrict,
  quantity        numeric(14,3) not null check (quantity > 0),
  -- Jika diisi, kasir override FIFO dan minta potong dari batch tertentu.
  override_batch_id uuid references public.stock_batches(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Transfer antar lokasi.
create table public.transfers (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id   uuid not null references public.locations(id) on delete restrict,
  mode            transfer_mode not null default 'two_way',
  status          transfer_status not null default 'pending',
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  confirmed_by    uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  shipped_at      timestamptz,
  received_at     timestamptz,
  constraint transfer_locations_differ check (from_location_id <> to_location_id)
);

create table public.transfer_items (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null references public.transfers(id) on delete cascade,
  source_batch_id uuid not null references public.stock_batches(id) on delete restrict,
  product_id      uuid not null references public.products(id) on delete restrict,
  quantity        numeric(14,3) not null check (quantity > 0),
  -- Batch tujuan dibuat saat transfer diterima (two_way) atau langsung (one_way).
  destination_batch_id uuid references public.stock_batches(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------- INDEXES ------------------------------------------------------
create index idx_profiles_outlet_id      on public.profiles(outlet_id);

create index idx_products_sku            on public.products(sku);
create index idx_products_is_perishable  on public.products(is_perishable) where is_active;

create index idx_batches_product_loc     on public.stock_batches(product_id, location_id);
create index idx_batches_location        on public.stock_batches(location_id);
create index idx_batches_produced_at     on public.stock_batches(produced_at);
create index idx_batches_expires_at      on public.stock_batches(expires_at)
  where expires_at is not null;
-- Penting untuk FIFO: cepatkan pencarian batch tersedia per produk+lokasi.
create index idx_batches_fifo
  on public.stock_batches(product_id, location_id, produced_at)
  where remaining_qty > 0;

create index idx_movements_loc_date      on public.stock_movements(location_id, occurred_at desc);
create index idx_movements_product       on public.stock_movements(product_id);
create index idx_movements_batch         on public.stock_movements(batch_id);

create index idx_sales_location_date     on public.sales(location_id, occurred_at desc);
create index idx_sale_items_sale         on public.sale_items(sale_id);

create index idx_transfers_status        on public.transfers(status);
create index idx_transfers_from_loc      on public.transfers(from_location_id);
create index idx_transfers_to_loc        on public.transfers(to_location_id);
create index idx_transfer_items_transfer on public.transfer_items(transfer_id);

-- ---------- TRIGGERS: updated_at -----------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_locations_updated
  before update on public.locations
  for each row execute function public.tg_set_updated_at();

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create trigger trg_products_updated
  before update on public.products
  for each row execute function public.tg_set_updated_at();

create trigger trg_batches_updated
  before update on public.stock_batches
  for each row execute function public.tg_set_updated_at();

-- ---------- TRIGGER: auto-compute expires_at -----------------------------
-- Jika produk perishable dan expires_at NULL saat insert, gunakan
-- default_shelf_life_hours produk untuk menghitungnya dari produced_at.
create or replace function public.tg_batch_set_expiry()
returns trigger
language plpgsql
as $$
declare
  v_is_perishable boolean;
  v_shelf_hours   integer;
begin
  select is_perishable, default_shelf_life_hours
    into v_is_perishable, v_shelf_hours
    from public.products
    where id = new.product_id;

  if v_is_perishable and new.expires_at is null and v_shelf_hours is not null then
    new.expires_at := new.produced_at + make_interval(hours => v_shelf_hours);
  elsif not v_is_perishable then
    -- non-perishable: pastikan expires_at NULL
    new.expires_at := null;
  end if;

  return new;
end;
$$;

create trigger trg_batches_set_expiry
  before insert on public.stock_batches
  for each row execute function public.tg_batch_set_expiry();

-- ---------- HELPER: current user role / outlet ---------------------------
create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select outlet_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

-- ---------- ROW LEVEL SECURITY -------------------------------------------
alter table public.locations        enable row level security;
alter table public.profiles         enable row level security;
alter table public.products         enable row level security;
alter table public.stock_batches    enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.sales            enable row level security;
alter table public.sale_items       enable row level security;
alter table public.transfers        enable row level security;
alter table public.transfer_items   enable row level security;

-- Lokasi: semua user terautentikasi bisa baca, hanya super admin yang ubah.
create policy "locations_read_all_auth"
  on public.locations for select
  to authenticated using (true);

create policy "locations_admin_write"
  on public.locations for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Profiles: user lihat profilnya sendiri; super admin lihat & kelola semua.
create policy "profiles_self_read"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_super_admin());

create policy "profiles_admin_write"
  on public.profiles for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Products: read all auth, write super admin only.
create policy "products_read_all_auth"
  on public.products for select
  to authenticated using (true);

create policy "products_admin_write"
  on public.products for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Stock batches: semua bisa baca (lihat stok semua outlet).
-- Insert/update: super admin atau pemilik outlet.
create policy "batches_read_all_auth"
  on public.stock_batches for select
  to authenticated using (true);

create policy "batches_write_owner_or_admin"
  on public.stock_batches for all
  to authenticated
  using (public.is_super_admin() or location_id = public.current_outlet_id())
  with check (public.is_super_admin() or location_id = public.current_outlet_id());

-- Stock movements: semua bisa baca; tulis hanya untuk lokasi sendiri.
create policy "movements_read_all_auth"
  on public.stock_movements for select
  to authenticated using (true);

create policy "movements_write_owner_or_admin"
  on public.stock_movements for insert
  to authenticated
  with check (public.is_super_admin() or location_id = public.current_outlet_id());

-- Sales: read all; insert hanya untuk lokasi sendiri.
create policy "sales_read_all_auth"
  on public.sales for select
  to authenticated using (true);

create policy "sales_write_owner_or_admin"
  on public.sales for insert
  to authenticated
  with check (public.is_super_admin() or location_id = public.current_outlet_id());

create policy "sale_items_read_all_auth"
  on public.sale_items for select
  to authenticated using (true);

create policy "sale_items_write_owner_or_admin"
  on public.sale_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and (public.is_super_admin() or s.location_id = public.current_outlet_id())
    )
  );

-- Transfers: read all; kasir hanya boleh insert kalau from_location = outlet sendiri,
-- dan boleh update (konfirmasi) kalau to_location = outlet sendiri.
create policy "transfers_read_all_auth"
  on public.transfers for select
  to authenticated using (true);

create policy "transfers_insert_from_owned"
  on public.transfers for insert
  to authenticated
  with check (
    public.is_super_admin()
    or from_location_id = public.current_outlet_id()
  );

create policy "transfers_update_participant"
  on public.transfers for update
  to authenticated
  using (
    public.is_super_admin()
    or from_location_id = public.current_outlet_id()
    or to_location_id   = public.current_outlet_id()
  )
  with check (
    public.is_super_admin()
    or from_location_id = public.current_outlet_id()
    or to_location_id   = public.current_outlet_id()
  );

create policy "transfer_items_read_all_auth"
  on public.transfer_items for select
  to authenticated using (true);

create policy "transfer_items_write_via_transfer"
  on public.transfer_items for all
  to authenticated
  using (
    exists (
      select 1 from public.transfers t
      where t.id = transfer_items.transfer_id
        and (
          public.is_super_admin()
          or t.from_location_id = public.current_outlet_id()
          or t.to_location_id   = public.current_outlet_id()
        )
    )
  )
  with check (
    exists (
      select 1 from public.transfers t
      where t.id = transfer_items.transfer_id
        and (
          public.is_super_admin()
          or t.from_location_id = public.current_outlet_id()
          or t.to_location_id   = public.current_outlet_id()
        )
    )
  );

-- ---------- REALTIME PUBLICATION -----------------------------------------
-- Aktifkan realtime untuk tabel yang sering di-stream ke UI.
alter publication supabase_realtime add table public.stock_batches;
alter publication supabase_realtime add table public.stock_movements;
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.sale_items;
alter publication supabase_realtime add table public.transfers;
alter publication supabase_realtime add table public.transfer_items;
