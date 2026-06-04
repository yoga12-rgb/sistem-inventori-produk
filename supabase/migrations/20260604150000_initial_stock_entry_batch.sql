-- =========================================================================
--  Initial Stock Entry Batch
--
--  Membuat pengisian stok awal multi-item menjadi atomic. Jika satu baris
--  gagal, seluruh function rollback otomatis sebagai satu transaksi.
-- =========================================================================

create or replace function public.fn_initial_stock_entry_batch(
  p_items jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item        jsonb;
  v_index       integer := 0;
  v_count       integer := 0;
  v_location_id uuid;
  v_product_id  uuid;
  v_quantity    numeric;
  v_produced_at timestamptz;
  v_expires_at  timestamptz;
  v_notes       text;
  v_perishable  boolean;
  v_batch_id    uuid;
  v_user        uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Super Admin yang bisa mencatat stok awal';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;

    v_location_id := (v_item->>'location_id')::uuid;
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_produced_at := nullif(v_item->>'produced_at', '')::timestamptz;
    v_expires_at := nullif(v_item->>'expires_at', '')::timestamptz;
    v_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Item #%: kuantitas harus > 0', v_index;
    end if;

    if not exists (
      select 1
        from public.locations
       where id = v_location_id
         and is_active = true
    ) then
      raise exception 'Item #%: lokasi tidak ditemukan atau tidak aktif', v_index;
    end if;

    select is_perishable
      into v_perishable
      from public.products
     where id = v_product_id
       and is_active = true;

    if v_perishable is null then
      raise exception 'Item #%: produk tidak ditemukan atau tidak aktif', v_index;
    end if;

    if v_perishable and v_produced_at is null then
      raise exception 'Item #%: tanggal produksi wajib untuk produk perishable', v_index;
    end if;

    insert into public.stock_batches (
      product_id, location_id, produced_at, expires_at,
      initial_qty, remaining_qty, notes, created_by
    ) values (
      v_product_id,
      v_location_id,
      coalesce(v_produced_at, now()),
      case when v_perishable then v_expires_at else null end,
      v_quantity,
      v_quantity,
      v_notes,
      v_user
    )
    returning id into v_batch_id;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_batch_id,
      v_product_id,
      v_location_id,
      'adjustment_in',
      v_quantity,
      coalesce(v_produced_at, now()),
      'initial_stock',
      v_batch_id,
      v_notes,
      v_user
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.fn_initial_stock_entry_batch(jsonb) to authenticated;
