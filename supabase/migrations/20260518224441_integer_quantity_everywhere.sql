-- =========================================================================
--  Integer-only quantity di semua tabel pergerakan stok
--
--  Domain bisnis pastry: semua produk dijual / dipindah dalam satuan
--  utuh (box, pcs, dll). Tidak ada timbangan. Karena itu enforce
--  bilangan bulat ≥ 1 di tingkat DB sehingga RPC, CLI, REST API,
--  semuanya tunduk pada aturan yang sama.
--
--  Kolom `quantity` tetap numeric(14,3) (tidak diubah ke integer)
--  agar future-proof — kalau suatu saat ada produk timbangan, kita
--  tinggal drop constraint per kasus tanpa migrasi tipe kolom.
-- =========================================================================

-- ---------- stock_batches: initial_qty & remaining_qty -----------------
alter table public.stock_batches
  add constraint stock_batches_initial_qty_int_min1
    check (initial_qty = floor(initial_qty) and initial_qty >= 1);

alter table public.stock_batches
  add constraint stock_batches_remaining_qty_int
    check (remaining_qty = floor(remaining_qty) and remaining_qty >= 0);

-- ---------- stock_movements: quantity ----------------------------------
alter table public.stock_movements
  add constraint stock_movements_quantity_int_min1
    check (quantity = floor(quantity) and quantity >= 1);

-- ---------- sale_items: quantity ---------------------------------------
alter table public.sale_items
  add constraint sale_items_quantity_int_min1
    check (quantity = floor(quantity) and quantity >= 1);

-- ---------- transfer_items: sudah ditambahkan di migration sebelumnya --

-- ---------- Update RPC functions agar pesan error lebih jelas ----------

-- fn_record_production -------------------------------------------------
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
  if p_quantity <> floor(p_quantity) then
    raise exception 'Kuantitas harus bilangan bulat';
  end if;
  if p_quantity < 1 then
    raise exception 'Kuantitas minimal 1';
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

-- fn_record_stock_entry ------------------------------------------------
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
  if p_quantity <> floor(p_quantity) then
    raise exception 'Kuantitas harus bilangan bulat';
  end if;
  if p_quantity < 1 then
    raise exception 'Kuantitas minimal 1';
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

-- fn_record_sale -------------------------------------------------------
create or replace function public.fn_record_sale(
  p_location_id  uuid,
  p_occurred_at  timestamptz,
  p_notes        text,
  p_items        jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_role        user_role;
  v_user_outlet uuid;
  v_sale_id     uuid;
  v_item        jsonb;
  v_qty         numeric;
  v_pid         uuid;
  v_override    uuid;
begin
  if v_user is null then
    raise exception 'Tidak terotentikasi';
  end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;
  if v_role is null then
    raise exception 'Profil tidak ditemukan';
  end if;
  if v_role <> 'super_admin' and v_user_outlet is distinct from p_location_id then
    raise exception 'Anda hanya bisa mencatat penjualan di outlet sendiri';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item';
  end if;

  insert into public.sales (location_id, occurred_at, notes, created_by)
       values (p_location_id, coalesce(p_occurred_at, now()), p_notes, v_user)
    returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_override := nullif((v_item->>'override_batch_id'), '')::uuid;

    if v_pid is null or v_qty is null or v_qty <= 0 then
      raise exception 'Item penjualan tidak valid';
    end if;
    if v_qty <> floor(v_qty) then
      raise exception 'Kuantitas penjualan harus bilangan bulat';
    end if;
    if v_qty < 1 then
      raise exception 'Kuantitas minimal 1';
    end if;

    insert into public.sale_items (sale_id, product_id, quantity, override_batch_id)
    values (v_sale_id, v_pid, v_qty, v_override);

    perform public.fn_deduct_stock_fifo(
      p_product_id     => v_pid,
      p_location_id    => p_location_id,
      p_quantity       => v_qty,
      p_movement_type  => 'sale_out'::stock_movement_type,
      p_batch_id       => v_override,
      p_reference_type => 'sale',
      p_reference_id   => v_sale_id,
      p_occurred_at    => coalesce(p_occurred_at, now()),
      p_notes          => null
    );
  end loop;

  return v_sale_id;
end;
$$;

-- fn_record_disposal ---------------------------------------------------
create or replace function public.fn_record_disposal(
  p_product_id     uuid,
  p_location_id    uuid,
  p_quantity       numeric,
  p_movement_type  stock_movement_type,
  p_batch_id       uuid default null,
  p_notes          text default null,
  p_occurred_at    timestamptz default now()
) returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_role        user_role;
  v_user_outlet uuid;
  v_total       numeric := 0;
  v_line        public.stock_deduction_line;
begin
  if v_user is null then raise exception 'Tidak terotentikasi'; end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;
  if v_role <> 'super_admin' and v_user_outlet is distinct from p_location_id then
    raise exception 'Anda hanya bisa mencatat di outlet sendiri';
  end if;
  if p_movement_type not in (
    'expired_out', 'damage_out', 'adjustment_out'
  ) then
    raise exception 'Movement type bukan disposal';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Kuantitas harus > 0';
  end if;
  if p_quantity <> floor(p_quantity) then
    raise exception 'Kuantitas harus bilangan bulat';
  end if;
  if p_quantity < 1 then
    raise exception 'Kuantitas minimal 1';
  end if;

  for v_line in
    select * from public.fn_deduct_stock_fifo(
      p_product_id, p_location_id, p_quantity, p_movement_type, p_batch_id,
      'disposal', null, p_occurred_at, p_notes
    )
  loop
    v_total := v_total + v_line.quantity_taken;
  end loop;

  return v_total;
end;
$$;

-- fn_deduct_stock_fifo --------------------------------------------------
-- Tambahkan validasi integer (qty masuk function ini selalu integer karena
-- dipanggil dari fn_record_sale / fn_record_disposal yang sudah validate,
-- tapi tetap defensive jika fn ini dipanggil langsung dari REST/CLI).
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
  if p_quantity <> floor(p_quantity) then
    raise exception 'Kuantitas harus bilangan bulat';
  end if;
  if p_movement_type in ('production_in', 'entry_in', 'transfer_in', 'adjustment_in') then
    raise exception 'fn_deduct_stock_fifo tidak boleh dipakai untuk movement IN';
  end if;

  select coalesce(sum(remaining_qty), 0) into v_total
    from public.stock_batches
    where product_id  = p_product_id
      and location_id = p_location_id
      and remaining_qty > 0;

  if v_total < p_quantity then
    raise exception 'Stok tidak cukup. Tersedia: %, diminta: %', v_total, p_quantity;
  end if;

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
    raise exception 'Stok tidak cukup setelah FIFO scan (sisa %)', v_remaining;
  end if;

  return;
end;
$$;
