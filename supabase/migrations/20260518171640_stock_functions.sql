-- =========================================================================
--  Stock Functions â€” Iterasi 2
--
--  Tujuan:
--   * fn_record_production:   buat batch baru di Central Pastry + log movement
--   * fn_record_stock_entry:  pemasukan stok non-perishable
--   * fn_deduct_stock_fifo:   pemotongan stok dengan FIFO + manual override
--
--  Semua function dijalankan dengan `security invoker` agar RLS user yang
--  memanggil tetap dievaluasi (Super Admin / Kasir di outlet sendiri).
-- =========================================================================

-- ---------- Result type untuk deduct (multi-batch) -----------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'stock_deduction_line'
  ) then
    create type public.stock_deduction_line as (
      batch_id        uuid,
      quantity_taken  numeric(14,3),
      movement_id     uuid
    );
  end if;
end$$;

-- ---------- fn_record_production -----------------------------------------
-- Membuat batch baru di lokasi tipe central_kitchen.
-- expires_at otomatis di-isi oleh trigger tg_batch_set_expiry kalau NULL.
create or replace function public.fn_record_production(
  p_product_id   uuid,
  p_location_id  uuid,
  p_quantity     numeric,
  p_produced_at  timestamptz default now(),
  p_expires_at   timestamptz default null,
  p_notes        text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loc_type   location_type;
  v_perishable boolean;
  v_batch_id   uuid;
  v_user       uuid := auth.uid();
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Kuantitas harus > 0';
  end if;

  select type into v_loc_type from public.locations where id = p_location_id;
  if v_loc_type is null then
    raise exception 'Lokasi tidak ditemukan';
  end if;
  if v_loc_type <> 'central_kitchen' then
    raise exception 'Produksi hanya diperbolehkan di Central Pastry';
  end if;

  select is_perishable into v_perishable
    from public.products where id = p_product_id;
  if v_perishable is null then
    raise exception 'Produk tidak ditemukan';
  end if;

  insert into public.stock_batches (
    product_id, location_id, produced_at, expires_at,
    initial_qty, remaining_qty, notes, created_by
  ) values (
    p_product_id, p_location_id, p_produced_at,
    case when v_perishable then p_expires_at else null end,
    p_quantity, p_quantity, p_notes, v_user
  )
  returning id into v_batch_id;

  insert into public.stock_movements (
    batch_id, product_id, location_id, movement_type, quantity,
    occurred_at, reference_type, reference_id, notes, created_by
  ) values (
    v_batch_id, p_product_id, p_location_id, 'production_in', p_quantity,
    p_produced_at, 'production', v_batch_id, p_notes, v_user
  );

  return v_batch_id;
end;
$$;

-- ---------- fn_record_stock_entry ----------------------------------------
-- Pemasukan stok untuk barang non-perishable. Lokasi: bebas (default Central
-- Kitchen). Untuk perishable, gunakan fn_record_production.
create or replace function public.fn_record_stock_entry(
  p_product_id   uuid,
  p_location_id  uuid,
  p_quantity     numeric,
  p_entered_at   timestamptz default now(),
  p_notes        text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_perishable boolean;
  v_batch_id   uuid;
  v_user       uuid := auth.uid();
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Kuantitas harus > 0';
  end if;

  select is_perishable into v_perishable
    from public.products where id = p_product_id;
  if v_perishable is null then
    raise exception 'Produk tidak ditemukan';
  end if;
  if v_perishable then
    raise exception 'Untuk produk perishable, gunakan fn_record_production';
  end if;

  insert into public.stock_batches (
    product_id, location_id, produced_at, expires_at,
    initial_qty, remaining_qty, notes, created_by
  ) values (
    p_product_id, p_location_id, p_entered_at, null,
    p_quantity, p_quantity, p_notes, v_user
  )
  returning id into v_batch_id;

  insert into public.stock_movements (
    batch_id, product_id, location_id, movement_type, quantity,
    occurred_at, reference_type, reference_id, notes, created_by
  ) values (
    v_batch_id, p_product_id, p_location_id, 'entry_in', p_quantity,
    p_entered_at, 'entry', v_batch_id, p_notes, v_user
  );

  return v_batch_id;
end;
$$;

-- ---------- fn_deduct_stock_fifo -----------------------------------------
-- Memotong stok menggunakan FIFO (produced_at ASC). Mendukung override:
--   * p_batch_id NOT NULL  â†’ semua qty diambil dari batch tersebut.
--   * p_batch_id NULL      â†’ otomatis FIFO, boleh pecah ke beberapa batch.
--
-- Mengembalikan setiap pemotongan sebagai baris stock_deduction_line.
create or replace function public.fn_deduct_stock_fifo(
  p_product_id     uuid,
  p_location_id    uuid,
  p_quantity       numeric,
  p_movement_type  stock_movement_type,
  p_batch_id       uuid default null,
  p_reference_type text default null,
  p_reference_id   uuid default null,
  p_occurred_at    timestamptz default now(),
  p_notes          text default null
) returns setof public.stock_deduction_line
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_remaining numeric := p_quantity;
  v_user      uuid := auth.uid();
  v_take      numeric;
  v_batch     record;
  v_movement  uuid;
  v_total     numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Kuantitas harus > 0';
  end if;
  if p_movement_type in ('production_in', 'entry_in', 'transfer_in', 'adjustment_in') then
    raise exception 'fn_deduct_stock_fifo tidak boleh dipakai untuk movement IN';
  end if;

  -- Cek total stok tersedia agar pesan error jelas (belum pecah ke FIFO).
  select coalesce(sum(remaining_qty), 0) into v_total
    from public.stock_batches
    where product_id  = p_product_id
      and location_id = p_location_id
      and remaining_qty > 0;

  if v_total < p_quantity then
    raise exception 'Stok tidak cukup. Tersedia: %, diminta: %', v_total, p_quantity;
  end if;

  -- Manual override: ambil dari satu batch.
  if p_batch_id is not null then
    select * into v_batch
      from public.stock_batches
      where id = p_batch_id
        and product_id = p_product_id
        and location_id = p_location_id
      for update;

    if v_batch.id is null then
      raise exception 'Batch tidak ditemukan untuk produk/lokasi tersebut';
    end if;
    if v_batch.remaining_qty < p_quantity then
      raise exception 'Batch hanya tersisa % unit', v_batch.remaining_qty;
    end if;

    update public.stock_batches
      set remaining_qty = remaining_qty - p_quantity
      where id = v_batch.id;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_batch.id, p_product_id, p_location_id, p_movement_type, p_quantity,
      p_occurred_at, p_reference_type, p_reference_id, p_notes, v_user
    )
    returning id into v_movement;

    return next (v_batch.id, p_quantity, v_movement)::public.stock_deduction_line;
    return;
  end if;

  -- FIFO: kunci dan iterasi batch tertua dulu.
  for v_batch in
    select id, remaining_qty
      from public.stock_batches
      where product_id  = p_product_id
        and location_id = p_location_id
        and remaining_qty > 0
      order by produced_at asc, created_at asc
      for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_remaining, v_batch.remaining_qty);

    update public.stock_batches
      set remaining_qty = remaining_qty - v_take
      where id = v_batch.id;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_batch.id, p_product_id, p_location_id, p_movement_type, v_take,
      p_occurred_at, p_reference_type, p_reference_id, p_notes, v_user
    )
    returning id into v_movement;

    v_remaining := v_remaining - v_take;
    return next (v_batch.id, v_take, v_movement)::public.stock_deduction_line;
  end loop;

  if v_remaining > 0 then
    -- Seharusnya tidak terjadi karena kita sudah cek total di atas.
    raise exception 'Stok tidak cukup setelah FIFO scan (sisa %)', v_remaining;
  end if;

  return;
end;
$$;

-- ---------- View: stok per produk + lokasi (agregat) ---------------------
-- Memudahkan UI menampilkan ringkasan stok per outlet tanpa N+1 query.
create or replace view public.v_stock_per_location as
  select
    b.product_id,
    p.sku,
    p.name           as product_name,
    p.unit,
    p.is_perishable,
    b.location_id,
    l.code           as location_code,
    l.name           as location_name,
    sum(b.remaining_qty)              as total_qty,
    count(*) filter (where b.remaining_qty > 0) as active_batches,
    min(b.expires_at) filter (where b.expires_at is not null and b.remaining_qty > 0)
                                      as nearest_expiry,
    min(b.produced_at) filter (where b.remaining_qty > 0)
                                      as oldest_produced_at
  from public.stock_batches b
  join public.products  p on p.id = b.product_id
  join public.locations l on l.id = b.location_id
  where b.remaining_qty > 0
  group by
    b.product_id, p.sku, p.name, p.unit, p.is_perishable,
    b.location_id, l.code, l.name;

comment on view public.v_stock_per_location is
  'Ringkasan stok aktif (remaining_qty > 0) per produk+lokasi.';

-- View tunduk pada RLS dari tabel sumber (Postgres 15+ default behaviour).

-- ---------- GRANTS -------------------------------------------------------
grant execute on function public.fn_record_production(uuid, uuid, numeric, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.fn_record_stock_entry(uuid, uuid, numeric, timestamptz, text) to authenticated;
grant execute on function public.fn_deduct_stock_fifo(uuid, uuid, numeric, stock_movement_type, uuid, text, uuid, timestamptz, text) to authenticated;
grant select on public.v_stock_per_location to authenticated;
