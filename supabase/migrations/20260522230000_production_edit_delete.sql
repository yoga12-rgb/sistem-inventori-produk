-- =========================================================================
--  Edit & Delete Production (Riwayat Produksi)
--
--  fn_update_production_qty:
--    Mengubah initial_qty dan remaining_qty batch produksi.
--    Mencatat movement kompensasi (adjustment_in jika naik,
--    adjustment_out jika turun). Validasi: sisa batch tidak boleh
--    kurang dari qty yang sudah terpakai.
--
--  fn_void_production:
--    "Menghapus" produksi dengan menghabiskan remaining_qty batch
--    via adjustment_out. Batch tetap ada di DB untuk audit trail.
--
--  Perbaikan: cast `v_movement_type` dan literal ke `stock_movement_type`
--    karena kolom `movement_type` di `stock_movements` bertipe enum.
-- =========================================================================

-- =========================================================================
--  1. Edit qty produksi
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

  -- Ambil batch info
  select initial_qty, remaining_qty, product_id, location_id
    into v_old_qty, v_used_qty, v_product_id, v_location_id
    from public.stock_batches
    where id = p_batch_id;

  if v_old_qty is null then
    raise exception 'Batch tidak ditemukan';
  end if;

  -- Hitung qty yang sudah terpakai (initial_qty - remaining_qty)
  v_used_qty := v_old_qty - v_used_qty;

  -- Validasi: qty baru tidak boleh kurang dari yang sudah terpakai
  if p_new_qty < v_used_qty then
    raise exception 'Qty baru (%) tidak boleh kurang dari qty yang sudah terpakai (%)', p_new_qty, v_used_qty;
  end if;

  -- Selisih
  v_diff := p_new_qty - v_old_qty;
  if v_diff > 0 then
    v_movement_type := 'adjustment_in'::stock_movement_type;
  else
    v_movement_type := 'adjustment_out'::stock_movement_type;
  end if;

  -- Update batch
  update public.stock_batches
    set initial_qty = p_new_qty,
        remaining_qty = remaining_qty + v_diff,
        notes = case when p_reason is not null then p_reason else notes end
    where id = p_batch_id;

  -- Log movement kompensasi (hanya jika ada perubahan)
  if v_diff <> 0 then
    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      p_batch_id, v_product_id, v_location_id, v_movement_type, abs(v_diff),
      now(), 'production_edit', p_batch_id,
      case when p_reason is not null then p_reason
           else format('Penyesuaian qty produksi: %s → %s', v_old_qty, p_new_qty)
      end,
      v_user
    );
  end if;
end;
$$;

grant execute on function public.fn_update_production_qty(uuid, numeric, text) to authenticated;

-- =========================================================================
--  2. Void/hapus produksi
-- =========================================================================

create or replace function public.fn_void_production(
  p_batch_id   uuid,
  p_reason     text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_remaining    numeric;
  v_product_id   uuid;
  v_location_id  uuid;
  v_user         uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Tidak terotentikasi';
  end if;

  select remaining_qty, product_id, location_id
    into v_remaining, v_product_id, v_location_id
    from public.stock_batches
    where id = p_batch_id;

  if v_remaining is null then
    raise exception 'Batch tidak ditemukan';
  end if;

  if v_remaining <= 0 then
    raise exception 'Batch sudah habis';
  end if;

  -- Update remaining_qty jadi 0
  update public.stock_batches
    set remaining_qty = 0,
        notes = case when p_reason is not null then p_reason else notes end
    where id = p_batch_id;

  -- Log movement adjustment_out untuk sisa stok
  insert into public.stock_movements (
    batch_id, product_id, location_id, movement_type, quantity,
    occurred_at, reference_type, reference_id, notes, created_by
  ) values (
    p_batch_id, v_product_id, v_location_id, 'adjustment_out'::stock_movement_type, v_remaining,
    now(), 'production_void', p_batch_id,
    coalesce(p_reason, 'Produksi dihapus / dibatalkan'),
    v_user
  );
end;
$$;

grant execute on function public.fn_void_production(uuid, text) to authenticated;
