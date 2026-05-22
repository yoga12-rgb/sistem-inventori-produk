-- =========================================================================
-- Sales — Void / Cancel transaction (soft delete)
--
-- Kasir dapat membatalkan transaksi yang dibuatnya pada hari yang sama.
-- Super admin dapat membatalkan transaksi kapan saja, di outlet manapun.
--
-- Strategi:
--   * Soft delete: tambah kolom voided_at, voided_by, void_reason di sales.
--     Sale tetap di DB untuk jejak audit, hanya dikecualikan dari laporan.
--   * Reversal movement: untuk setiap stock_movements asli (sale_out) dari
--     sale ini, dibuat movement baru bertipe 'sale_void' yang mengembalikan
--     remaining_qty batch.
--   * EOD report mengecualikan sale yang voided_at IS NOT NULL.
--   * Inventory Matrix kolom 'sold' = sum(sale_out) - sum(sale_void).
--
-- Idempotent: fn_void_sale tidak melakukan apa-apa kalau sale sudah void.
-- =========================================================================

-- ---------- Enum value baru ----------------------------------------------
alter type public.stock_movement_type add value if not exists 'sale_void';

-- ---------- Kolom soft-delete pada sales ---------------------------------
alter table public.sales
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid references public.profiles(id) on delete set null,
  add column if not exists void_reason text;

create index if not exists idx_sales_voided_at on public.sales(voided_at);

-- ---------- RLS: izinkan UPDATE untuk void --------------------------------
-- Kasir hanya boleh update sale-nya sendiri di hari yang sama (Asia/Jakarta).
-- Super admin bebas.
drop policy if exists "sales_void_owner_or_admin" on public.sales;
create policy "sales_void_owner_or_admin"
  on public.sales for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      created_by = auth.uid()
      and location_id = public.current_outlet_id()
      and (occurred_at at time zone 'Asia/Jakarta')::date
          = (now() at time zone 'Asia/Jakarta')::date
    )
  )
  with check (
    public.is_super_admin()
    or (
      created_by = auth.uid()
      and location_id = public.current_outlet_id()
      and (occurred_at at time zone 'Asia/Jakarta')::date
          = (now() at time zone 'Asia/Jakarta')::date
    )
  );

-- Stock movements untuk reversal — kasir boleh insert sale_void di lokasi
-- sendiri (policy movements_write_owner_or_admin sudah cover by location_id).
-- Tidak perlu policy baru.

-- ---------- fn_void_sale --------------------------------------------------
-- Membatalkan satu sale: tandai voided + buat reversal movements.
-- Validasi izin tetap melalui RLS (UPDATE pada sales). Function memakai
-- security invoker supaya `auth.uid()` & policy berlaku per pemanggil.
create or replace function public.fn_void_sale(
  p_sale_id  uuid,
  p_reason   text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_now         timestamptz := now();
  v_location_id uuid;
  v_voided_at   timestamptz;
  v_mv          record;
begin
  if v_user is null then
    raise exception 'Tidak ada session';
  end if;

  -- Lock sale row agar concurrent void tidak balap reversal ganda.
  select location_id, voided_at
    into v_location_id, v_voided_at
    from public.sales
    where id = p_sale_id
    for update;

  if v_location_id is null then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  -- Idempoten: sudah pernah di-void, tidak melakukan apa-apa.
  if v_voided_at is not null then
    return;
  end if;

  -- Tandai voided. RLS akan menolak kalau user tidak berhak.
  update public.sales
     set voided_at   = v_now,
         voided_by   = v_user,
         void_reason = nullif(trim(p_reason), '')
   where id = p_sale_id;

  -- Reversal: untuk setiap movement sale_out yang berasal dari sale ini,
  -- kembalikan ke batch yang sama dan log movement tipe 'sale_void'.
  for v_mv in
    select id, batch_id, product_id, location_id, quantity, occurred_at
      from public.stock_movements
     where reference_type = 'sale'
       and reference_id   = p_sale_id
       and movement_type  = 'sale_out'
  loop
    update public.stock_batches
       set remaining_qty = remaining_qty + v_mv.quantity
     where id = v_mv.batch_id;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_mv.batch_id, v_mv.product_id, v_mv.location_id,
      'sale_void', v_mv.quantity,
      v_now, 'sale_void', p_sale_id,
      coalesce(p_reason, 'Pembatalan transaksi'),
      v_user
    );
  end loop;
end;
$$;

grant execute on function public.fn_void_sale(uuid, text) to authenticated;

-- ---------- fn_eod_report — exclude void sales --------------------------
-- Sebelumnya 'sold' diambil dari stock_movements bertipe 'sale_out'. Sekarang
-- kita exclude movement yang sudah ada reversal-nya dengan menghitung NET:
-- sold = sum(sale_out) - sum(sale_void) per produk per hari.
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

  -- Penjualan: sale_out dikurangi sale_void (per produk, hari ini saja).
  select coalesce(jsonb_agg(j order by j->>'name'), '[]'::jsonb)
    into v_sold
  from (
    select jsonb_build_object(
             'product_id', m.product_id,
             'sku',  p.sku,
             'name', p.name,
             'unit', p.unit,
             'quantity',
               coalesce(sum(case when m.movement_type='sale_out' then m.quantity end), 0)
             - coalesce(sum(case when m.movement_type='sale_void' then m.quantity end), 0)
           ) as j
      from public.stock_movements m
      join public.products p on p.id = m.product_id
     where m.location_id = p_location_id
       and m.movement_type in ('sale_out', 'sale_void')
       and m.occurred_at >= v_start
       and m.occurred_at <  v_end
     group by m.product_id, p.sku, p.name, p.unit
     having
       coalesce(sum(case when m.movement_type='sale_out' then m.quantity end), 0)
     - coalesce(sum(case when m.movement_type='sale_void' then m.quantity end), 0) > 0
  ) s;

  -- Disposal terkelompok per kategori (tidak berubah).
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

  -- Stok akhir (tidak berubah).
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

-- ---------- fn_inventory_matrix — sale_void mengurangi 'sold' ----------
-- Kolom 'sold' sekarang menggunakan NET = sale_out - sale_void.
-- 'sale_void' juga dianggap IN saat menghitung opening (net_before) supaya
-- stok awal hari konsisten.
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
                   'production_in','entry_in','transfer_in','adjustment_in',
                   'sale_void'
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
      coalesce(sum(case when movement_type='sale_out'       then quantity end), 0)
        - coalesce(sum(case when movement_type='sale_void'  then quantity end), 0) as sold,
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
