-- =========================================================================
--  Disposal & matrix updates — Compliment + Tester
--
--  Perubahan:
--   1. fn_record_disposal: terima 5 movement_type — expired_out, damage_out,
--      compliment_out, tester_out, adjustment_out (adjustment dipertahankan
--      di DB untuk movement otomatis pembatalan transfer; UI tidak lagi
--      memunculkannya sebagai pilihan kasir).
--   2. inventory_matrix_row: tambah kolom compliment_out & tester_out.
--   3. fn_inventory_matrix: agregasi kolom baru + opening tetap menghitung
--      semua kategori out lama & baru.
--   4. fn_inventory_matrix_cell: kind 'compliment' & 'tester' baru;
--      'out' sekarang menggabungkan semua disposal.
-- =========================================================================

-- ---------- fn_record_disposal -------------------------------------------
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
    'expired_out', 'damage_out', 'compliment_out', 'tester_out',
    'adjustment_out'
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

-- ---------- Type inventory_matrix_row: tambah kolom ----------------------
-- ALTER TYPE ... ADD ATTRIBUTE WAJIB di-commit dulu agar function di bawah
-- bisa men-cast composite dengan kolom baru. Kalau sudah ada, no-op.
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'public.inventory_matrix_row'::regclass
       and attname = 'compliment_out'
  ) then
    alter type public.inventory_matrix_row
      add attribute compliment_out numeric,
      add attribute tester_out     numeric;
  end if;
end$$;

-- ---------- fn_inventory_matrix -----------------------------------------
create or replace function public.fn_inventory_matrix(
  p_date         date,
  p_location_id  uuid default null
) returns setof public.inventory_matrix_row
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tz    text := 'Asia/Jakarta';
  v_start timestamptz;
  v_end   timestamptz;
begin
  v_start := (p_date::timestamp        at time zone v_tz);
  v_end   := ((p_date + 1)::timestamp  at time zone v_tz);

  return query
  with day_movs as (
    select m.product_id, m.location_id, m.movement_type, m.quantity
      from public.stock_movements m
     where m.occurred_at >= v_start
       and m.occurred_at <  v_end
       and (p_location_id is null or m.location_id = p_location_id)
  ),
  before_movs as (
    select m.product_id, m.location_id,
           sum(case
                 when m.movement_type in (
                   'production_in','entry_in','transfer_in','adjustment_in'
                 ) then m.quantity
                 when m.movement_type in (
                   'sale_out','expired_out','damage_out','compliment_out',
                   'tester_out','adjustment_out','transfer_out'
                 ) then -m.quantity
                 else 0
               end) as net_before
      from public.stock_movements m
     where m.occurred_at < v_start
       and (p_location_id is null or m.location_id = p_location_id)
     group by m.product_id, m.location_id
  ),
  agg_day as (
    select
      product_id, location_id,
      coalesce(sum(case when movement_type='production_in'  then quantity end), 0) as produced_in,
      coalesce(sum(case when movement_type='entry_in'       then quantity end), 0) as entered_in,
      coalesce(sum(case when movement_type='transfer_in'    then quantity end), 0) as transfer_in,
      coalesce(sum(case when movement_type='transfer_out'   then quantity end), 0) as transfer_out,
      coalesce(sum(case when movement_type='sale_out'       then quantity end), 0) as sold,
      coalesce(sum(case when movement_type='expired_out'    then quantity end), 0) as expired_out,
      coalesce(sum(case when movement_type='damage_out'     then quantity end), 0) as damage_out,
      coalesce(sum(case when movement_type='compliment_out' then quantity end), 0) as compliment_out,
      coalesce(sum(case when movement_type='tester_out'     then quantity end), 0) as tester_out,
      coalesce(sum(case when movement_type='adjustment_in'  then quantity end), 0) as adjustment_in,
      coalesce(sum(case when movement_type='adjustment_out' then quantity end), 0) as adjustment_out
    from day_movs
    group by product_id, location_id
  ),
  combined as (
    select coalesce(d.product_id,  b.product_id)  as product_id,
           coalesce(d.location_id, b.location_id) as location_id,
           coalesce(b.net_before, 0)              as opening,
           coalesce(d.produced_in, 0)             as produced_in,
           coalesce(d.entered_in, 0)              as entered_in,
           coalesce(d.transfer_in, 0)             as transfer_in,
           coalesce(d.transfer_out, 0)            as transfer_out,
           coalesce(d.sold, 0)                    as sold,
           coalesce(d.expired_out, 0)             as expired_out,
           coalesce(d.damage_out, 0)              as damage_out,
           coalesce(d.compliment_out, 0)          as compliment_out,
           coalesce(d.tester_out, 0)              as tester_out,
           coalesce(d.adjustment_in, 0)           as adjustment_in,
           coalesce(d.adjustment_out, 0)          as adjustment_out
      from agg_day d
      full outer join before_movs b
        on d.product_id = b.product_id
       and d.location_id = b.location_id
  )
  select c.product_id,
         p.sku, p.name, p.unit, p.is_perishable,
         c.location_id, l.code, l.name,
         c.opening,
         c.produced_in, c.entered_in,
         c.transfer_in, c.transfer_out,
         c.sold,
         c.expired_out, c.damage_out,
         c.adjustment_in, c.adjustment_out,
         (c.opening
          + c.produced_in + c.entered_in
          + c.transfer_in + c.adjustment_in
          - c.transfer_out - c.sold
          - c.expired_out - c.damage_out
          - c.compliment_out - c.tester_out
          - c.adjustment_out) as closing,
         c.compliment_out,
         c.tester_out
    from combined c
    join public.products  p on p.id = c.product_id
    join public.locations l on l.id = c.location_id
   where not (
        c.opening = 0
    and c.produced_in = 0 and c.entered_in = 0
    and c.transfer_in = 0 and c.transfer_out = 0
    and c.sold = 0
    and c.expired_out = 0 and c.damage_out = 0
    and c.compliment_out = 0 and c.tester_out = 0
    and c.adjustment_in = 0 and c.adjustment_out = 0
   )
   order by p.name, l.code;
end;
$$;

-- ---------- fn_inventory_matrix_cell ------------------------------------
create or replace function public.fn_inventory_matrix_cell(
  p_product_id   uuid,
  p_location_id  uuid,
  p_date         date,
  p_kind         text
) returns table (
  movement_id    uuid,
  occurred_at    timestamptz,
  movement_type  stock_movement_type,
  quantity       numeric,
  batch_id       uuid,
  produced_at    timestamptz,
  reference_type text,
  reference_id   uuid,
  notes          text,
  actor_name     text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tz    text := 'Asia/Jakarta';
  v_start timestamptz := (p_date::timestamp at time zone v_tz);
  v_end   timestamptz := ((p_date + 1)::timestamp at time zone v_tz);
  v_types stock_movement_type[];
begin
  case lower(p_kind)
    when 'produced'        then v_types := array['production_in']::stock_movement_type[];
    when 'entered'         then v_types := array['entry_in']::stock_movement_type[];
    when 'transfer_in'     then v_types := array['transfer_in']::stock_movement_type[];
    when 'transfer_out'    then v_types := array['transfer_out']::stock_movement_type[];
    when 'sold'            then v_types := array['sale_out']::stock_movement_type[];
    when 'expired'         then v_types := array['expired_out']::stock_movement_type[];
    when 'damage'          then v_types := array['damage_out']::stock_movement_type[];
    when 'compliment'      then v_types := array['compliment_out']::stock_movement_type[];
    when 'tester'          then v_types := array['tester_out']::stock_movement_type[];
    when 'adjustment_in'   then v_types := array['adjustment_in']::stock_movement_type[];
    when 'adjustment_out'  then v_types := array['adjustment_out']::stock_movement_type[];
    when 'in'              then v_types := array['production_in','entry_in','transfer_in','adjustment_in']::stock_movement_type[];
    when 'out'             then v_types := array['sale_out','transfer_out','expired_out','damage_out','compliment_out','tester_out','adjustment_out']::stock_movement_type[];
    else
      raise exception 'Kind tidak dikenal: %', p_kind;
  end case;

  return query
  select m.id, m.occurred_at, m.movement_type, m.quantity,
         b.id, b.produced_at,
         m.reference_type, m.reference_id, m.notes,
         pr.full_name
    from public.stock_movements m
    left join public.stock_batches b on b.id = m.batch_id
    left join public.profiles      pr on pr.id = m.created_by
   where m.product_id  = p_product_id
     and m.location_id = p_location_id
     and m.occurred_at >= v_start
     and m.occurred_at <  v_end
     and m.movement_type = any(v_types)
   order by m.occurred_at desc;
end;
$$;

-- ---------- fn_eod_report ------------------------------------------------
-- Tambahkan section `disposal` (per kategori) untuk dipakai panel EOD.
create or replace function public.fn_eod_report(
  p_location_id uuid,
  p_date        date
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tz       text := 'Asia/Jakarta';
  v_start    timestamptz;
  v_end      timestamptz;
  v_sold     jsonb;
  v_stock    jsonb;
  v_disposal jsonb;
begin
  v_start := (p_date::timestamp at time zone v_tz);
  v_end   := ((p_date + 1)::timestamp at time zone v_tz);

  -- Penjualan.
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

  -- Disposal terkelompok per kategori.
  select coalesce(
           jsonb_object_agg(category, items)
             filter (where items is not null),
           '{}'::jsonb
         )
    into v_disposal
  from (
    select category,
           coalesce(jsonb_agg(j order by j->>'name'), '[]'::jsonb) as items
      from (
        select case m.movement_type
                 when 'expired_out'    then 'expired'
                 when 'damage_out'     then 'damage'
                 when 'compliment_out' then 'compliment'
                 when 'tester_out'     then 'tester'
                 when 'adjustment_out' then 'adjustment'
               end as category,
               jsonb_build_object(
                 'product_id', m.product_id,
                 'sku',  p.sku,
                 'name', p.name,
                 'unit', p.unit,
                 'quantity', sum(m.quantity)
               ) as j
          from public.stock_movements m
          join public.products p on p.id = m.product_id
         where m.location_id = p_location_id
           and m.movement_type in (
             'expired_out','damage_out','compliment_out',
             'tester_out','adjustment_out'
           )
           and m.occurred_at >= v_start
           and m.occurred_at <  v_end
         group by m.movement_type, m.product_id, p.sku, p.name, p.unit
      ) per_movement
     group by category
  ) per_cat;

  -- Stok akhir.
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

  return jsonb_build_object(
    'sold', v_sold,
    'disposal', v_disposal,
    'stock_now', v_stock
  );
end;
$$;
