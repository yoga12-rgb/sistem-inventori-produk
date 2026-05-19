-- =========================================================================
--  Inventory Matrix — Iterasi 5
--
--  Fungsi:
--   * fn_inventory_matrix(p_date, p_location_id?)
--       Mengembalikan satu baris per (product, location) berisi:
--         opening, produced_in, entered_in, transfer_in, transfer_out,
--         sold, expired_out, damage_out, adjustment_in, adjustment_out,
--         closing
--       di tanggal lokal (Asia/Jakarta). Bila p_location_id NULL, semua
--       lokasi dijumlahkan per produk (tipe lokasi 'all').
--
--   * fn_inventory_matrix_cell(p_product_id, p_location_id, p_date,
--                              p_kind)
--       Drilldown: daftar movement individual untuk satu sel matrix
--       (kind = 'in' | 'out' | 'sold' | 'transfer_in' | 'transfer_out' |
--                'produced' | 'entered' | 'expired' | 'damage' |
--                'adjustment_in' | 'adjustment_out')
-- =========================================================================

-- ---------- Type hasil matrix -------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'inventory_matrix_row'
  ) then
    create type public.inventory_matrix_row as (
      product_id        uuid,
      sku               text,
      product_name      text,
      unit              text,
      is_perishable     boolean,
      location_id       uuid,
      location_code     text,
      location_name     text,
      opening           numeric,
      produced_in       numeric,
      entered_in        numeric,
      transfer_in       numeric,
      transfer_out      numeric,
      sold              numeric,
      expired_out       numeric,
      damage_out        numeric,
      adjustment_in     numeric,
      adjustment_out    numeric,
      closing           numeric
    );
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
    -- Movement yang TERJADI pada tanggal target.
    select m.product_id, m.location_id, m.movement_type, m.quantity
      from public.stock_movements m
     where m.occurred_at >= v_start
       and m.occurred_at <  v_end
       and (p_location_id is null or m.location_id = p_location_id)
  ),
  before_movs as (
    -- Movement SEBELUM tanggal target untuk hitung opening.
    -- Net = sum(qty signed by direction).
    select m.product_id, m.location_id,
           sum(case
                 when m.movement_type in (
                   'production_in','entry_in','transfer_in','adjustment_in'
                 ) then m.quantity
                 when m.movement_type in (
                   'sale_out','expired_out','damage_out',
                   'adjustment_out','transfer_out'
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
      coalesce(sum(case when movement_type='adjustment_in'  then quantity end), 0) as adjustment_in,
      coalesce(sum(case when movement_type='adjustment_out' then quantity end), 0) as adjustment_out
    from day_movs
    group by product_id, location_id
  ),
  combined as (
    -- Gabungkan: produk × lokasi yang muncul di hari tsb ATAU sebelumnya.
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
          - c.adjustment_out) as closing
    from combined c
    join public.products  p on p.id = c.product_id
    join public.locations l on l.id = c.location_id
   -- Sembunyikan baris yang totally idle: opening 0 dan tidak ada movement hari itu.
   where not (
        c.opening = 0
    and c.produced_in = 0 and c.entered_in = 0
    and c.transfer_in = 0 and c.transfer_out = 0
    and c.sold = 0
    and c.expired_out = 0 and c.damage_out = 0
    and c.adjustment_in = 0 and c.adjustment_out = 0
   )
   order by p.name, l.code;
end;
$$;

comment on function public.fn_inventory_matrix(date, uuid) is
  'Inventory matrix per (product, location) untuk satu tanggal lokal. p_location_id NULL = semua lokasi.';

-- ---------- fn_inventory_matrix_cell ------------------------------------
-- Daftar movement detail untuk satu sel di matrix. Dipakai modal drilldown.
create or replace function public.fn_inventory_matrix_cell(
  p_product_id   uuid,
  p_location_id  uuid,
  p_date         date,
  p_kind         text   -- lihat header file untuk nilai yang diterima
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
    when 'adjustment_in'   then v_types := array['adjustment_in']::stock_movement_type[];
    when 'adjustment_out'  then v_types := array['adjustment_out']::stock_movement_type[];
    when 'in'              then v_types := array['production_in','entry_in','transfer_in','adjustment_in']::stock_movement_type[];
    when 'out'             then v_types := array['sale_out','transfer_out','expired_out','damage_out','adjustment_out']::stock_movement_type[];
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

-- ---------- GRANTS -------------------------------------------------------
grant execute on function public.fn_inventory_matrix(date, uuid)            to authenticated;
grant execute on function public.fn_inventory_matrix_cell(uuid, uuid, date, text) to authenticated;
