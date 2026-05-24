-- =========================================================================
-- Inventory matrix ordering
--
-- Keep the same result shape, but order rows by product category sort first.
-- This matters because the UI paginates the RPC with range(), so ordering must
-- happen inside the database function rather than only in the client.
-- =========================================================================

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
                   'tester_out','adjustment_out','transfer_out','transfer_loss'
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
      coalesce(sum(case when movement_type='transfer_loss'  then quantity end), 0) as transfer_loss,
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
           coalesce(d.transfer_loss, 0)           as transfer_loss,
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
          - c.transfer_out - c.transfer_loss - c.sold
          - c.expired_out - c.damage_out
          - c.compliment_out - c.tester_out
          - c.adjustment_out) as closing,
         c.compliment_out,
         c.tester_out,
         c.transfer_loss
    from combined c
    join public.products  p on p.id = c.product_id
    join public.locations l on l.id = c.location_id
    left join public.product_categories pc on pc.id = p.category_id
   where not (
        c.opening = 0
    and c.produced_in = 0 and c.entered_in = 0
    and c.transfer_in = 0 and c.transfer_out = 0
    and c.transfer_loss = 0
    and c.sold = 0
    and c.expired_out = 0 and c.damage_out = 0
    and c.compliment_out = 0 and c.tester_out = 0
    and c.adjustment_in = 0 and c.adjustment_out = 0
   )
   order by
     coalesce(pc.sort, 2147483647),
     pc.name nulls last,
     p.name,
     l.code;
end;
$$;
