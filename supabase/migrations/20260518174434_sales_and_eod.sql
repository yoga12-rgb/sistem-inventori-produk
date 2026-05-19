-- =========================================================================
--  Sales, Disposal, & EOD — Iterasi 4
--
--  Fungsi:
--   * fn_record_sale       — 1 transaksi multi-item, FIFO + manual override.
--   * fn_record_disposal   — buang stok (expired/damage), FIFO atau batch
--                             tertentu. Wraper di atas fn_deduct_stock_fifo.
--   * fn_eod_report        — agregat penjualan + stok akhir (per produk +
--                             breakdown per batch) untuk satu tanggal &
--                             outlet. Output siap di-format ke teks WA.
-- =========================================================================

-- ---------- fn_record_sale -----------------------------------------------
-- p_items: jsonb array [{product_id, quantity, override_batch_id?}]
-- Mengembalikan id sale baru. Memakai fn_deduct_stock_fifo per item.
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

    -- Sale item header (audit). FIFO function akan log per movement.
    insert into public.sale_items (sale_id, product_id, quantity, override_batch_id)
    values (v_sale_id, v_pid, v_qty, v_override);

    -- Pemotongan stok via FIFO terpusat. Multi-batch otomatis.
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

-- ---------- fn_record_disposal -------------------------------------------
-- Buang stok karena expired/damage/adjustment_out, untuk satu produk.
-- Batch override boleh, default FIFO. Mengembalikan total qty terbuang.
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

-- ---------- fn_eod_report ------------------------------------------------
-- Ringkasan untuk satu outlet pada satu tanggal lokal Asia/Jakarta.
-- Output: dua "section" sebagai array of JSON.
--
--   sold:          [{product_id, sku, name, unit, quantity}]
--   stock_now:     [{product_id, sku, name, unit, total, batches:[{date, qty}]}]
--
-- Keduanya cukup untuk membangun teks WhatsApp di sisi UI.
create or replace function public.fn_eod_report(
  p_location_id uuid,
  p_date        date
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tz    text := 'Asia/Jakarta';
  v_start timestamptz;
  v_end   timestamptz;
  v_sold  jsonb;
  v_stock jsonb;
begin
  v_start := (p_date::timestamp at time zone v_tz);
  v_end   := ((p_date + 1)::timestamp at time zone v_tz);

  -- Penjualan (qty per produk) di rentang tanggal terpilih.
  select coalesce(jsonb_agg(j order by j->>'name'), '[]'::jsonb)
    into v_sold
  from (
    select jsonb_build_object(
             'product_id', m.product_id,
             'sku',  p.sku,
             'name', p.name,
             'unit', p.unit,
             'quantity', sum(m.quantity)
           ) as j
      from public.stock_movements m
      join public.products p on p.id = m.product_id
     where m.location_id = p_location_id
       and m.movement_type = 'sale_out'
       and m.occurred_at >= v_start
       and m.occurred_at <  v_end
     group by m.product_id, p.sku, p.name, p.unit
  ) s;

  -- Stok akhir per produk + breakdown per tanggal produksi/entry.
  with batch_dates as (
    select b.product_id, p.sku, p.name, p.unit,
           (b.produced_at at time zone v_tz)::date as batch_date,
           sum(b.remaining_qty) as qty
      from public.stock_batches b
      join public.products p on p.id = b.product_id
     where b.location_id = p_location_id
       and b.remaining_qty > 0
     group by b.product_id, p.sku, p.name, p.unit, batch_date
  ),
  per_product as (
    select product_id, sku, name, unit,
           sum(qty) as total,
           jsonb_agg(
             jsonb_build_object('date', batch_date, 'qty', qty)
             order by batch_date desc
           ) as batches
      from batch_dates
     group by product_id, sku, name, unit
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'product_id', product_id,
             'sku',  sku,
             'name', name,
             'unit', unit,
             'total', total,
             'batches', batches
           ) order by name
         ), '[]'::jsonb)
    into v_stock
  from per_product;

  return jsonb_build_object('sold', v_sold, 'stock_now', v_stock);
end;
$$;

-- ---------- GRANTS -------------------------------------------------------
grant execute on function public.fn_record_sale(uuid, timestamptz, text, jsonb) to authenticated;
grant execute on function public.fn_record_disposal(uuid, uuid, numeric, stock_movement_type, uuid, text, timestamptz) to authenticated;
grant execute on function public.fn_eod_report(uuid, date) to authenticated;
