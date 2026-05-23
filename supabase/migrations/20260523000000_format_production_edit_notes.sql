-- =========================================================================
--  Format production edit notes as integer quantities
--
--  Quantity columns are numeric(14,3) for future flexibility, but current
--  business rules enforce integer quantities. This keeps auto-generated
--  production edit notes aligned with that invariant:
--    "Penyesuaian qty produksi: 100 -> 10"
--  instead of:
--    "Penyesuaian qty produksi: 100.000 -> 10"
-- =========================================================================

create or replace function public.fn_update_production_qty(
  p_batch_id   uuid,
  p_new_qty    numeric,
  p_reason     text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_qty        numeric;
  v_used_qty       numeric;
  v_diff           numeric;
  v_product_id     uuid;
  v_location_id    uuid;
  v_user           uuid := auth.uid();
  v_movement_type  stock_movement_type;
begin
  if v_user is null then
    raise exception 'Tidak terotentikasi';
  end if;

  if p_new_qty is null or p_new_qty <= 0 then
    raise exception 'Kuantitas baru harus > 0';
  end if;
  if p_new_qty <> floor(p_new_qty) then
    raise exception 'Kuantitas harus bilangan bulat';
  end if;

  select initial_qty, remaining_qty, product_id, location_id
    into v_old_qty, v_used_qty, v_product_id, v_location_id
    from public.stock_batches
    where id = p_batch_id;

  if v_old_qty is null then
    raise exception 'Batch tidak ditemukan';
  end if;

  v_used_qty := v_old_qty - v_used_qty;

  if p_new_qty < v_used_qty then
    raise exception 'Qty baru (%) tidak boleh kurang dari qty yang sudah terpakai (%)', p_new_qty, v_used_qty;
  end if;

  v_diff := p_new_qty - v_old_qty;
  if v_diff > 0 then
    v_movement_type := 'adjustment_in'::stock_movement_type;
  else
    v_movement_type := 'adjustment_out'::stock_movement_type;
  end if;

  update public.stock_batches
    set initial_qty = p_new_qty,
        remaining_qty = remaining_qty + v_diff,
        notes = case when p_reason is not null then p_reason else notes end
    where id = p_batch_id;

  if v_diff <> 0 then
    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      p_batch_id, v_product_id, v_location_id, v_movement_type, abs(v_diff),
      now(), 'production_edit', p_batch_id,
      case when p_reason is not null then p_reason
           else format(
             'Penyesuaian qty produksi: %s -> %s',
             to_char(v_old_qty, 'FM999999999999990'),
             to_char(p_new_qty, 'FM999999999999990')
           )
      end,
      v_user
    );
  end if;
end;
$$;

grant execute on function public.fn_update_production_qty(uuid, numeric, text) to authenticated;
