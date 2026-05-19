-- =========================================================================
--  Multi-item production RPC
--
--  fn_record_production_batch:
--    Mencatat banyak batch sekaligus dalam satu transaksi.
--    Input: array of items [{ product_id, quantity, expires_at? }].
--    Lokasi & produced_at sama untuk semua item dalam satu submission
--    (lokasi central pastry; produced_at default now()).
--
--    Kalau salah satu item invalid → seluruh transaksi rollback.
--    Mengembalikan array uuid batch yang baru dibuat (urutan input).
-- =========================================================================

create or replace function public.fn_record_production_batch(
  p_location_id  uuid,
  p_produced_at  timestamptz,
  p_items        jsonb
) returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loc_type   location_type;
  v_user       uuid := auth.uid();
  v_item       jsonb;
  v_pid        uuid;
  v_qty        numeric;
  v_expires    timestamptz;
  v_perishable boolean;
  v_shelf      integer;
  v_batch_id   uuid;
  v_ids        uuid[] := array[]::uuid[];
  v_produced   timestamptz;
begin
  if v_user is null then
    raise exception 'Tidak terotentikasi';
  end if;

  -- Validasi lokasi: harus central pastry.
  select type into v_loc_type from public.locations where id = p_location_id;
  if v_loc_type is null then
    raise exception 'Lokasi tidak ditemukan';
  end if;
  if v_loc_type <> 'central_kitchen' then
    raise exception 'Produksi hanya diperbolehkan di Central Pastry';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item';
  end if;

  v_produced := coalesce(p_produced_at, now());

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_expires := nullif((v_item->>'expires_at'), '')::timestamptz;

    -- Validasi qty.
    if v_pid is null then
      raise exception 'Produk tidak boleh kosong';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Kuantitas harus > 0';
    end if;
    if v_qty <> floor(v_qty) then
      raise exception 'Kuantitas harus bilangan bulat';
    end if;
    if v_qty < 1 then
      raise exception 'Kuantitas minimal 1';
    end if;

    -- Validasi produk + sniff perishable.
    select is_perishable, default_shelf_life_hours
      into v_perishable, v_shelf
      from public.products
      where id = v_pid;

    if v_perishable is null then
      raise exception 'Produk tidak ditemukan';
    end if;

    -- Untuk perishable: hitung expires_at otomatis kalau tidak diberikan.
    if v_perishable and v_expires is null and v_shelf is not null then
      v_expires := v_produced + make_interval(hours => v_shelf);
    elsif not v_perishable then
      v_expires := null;
    end if;

    -- Insert batch.
    insert into public.stock_batches (
      product_id, location_id, produced_at, expires_at,
      initial_qty, remaining_qty, created_by
    ) values (
      v_pid, p_location_id, v_produced,
      case when v_perishable then v_expires else null end,
      v_qty, v_qty, v_user
    )
    returning id into v_batch_id;

    -- Log movement.
    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, created_by
    ) values (
      v_batch_id, v_pid, p_location_id, 'production_in', v_qty,
      v_produced, 'production', v_batch_id, v_user
    );

    v_ids := array_append(v_ids, v_batch_id);
  end loop;

  return v_ids;
end;
$$;

grant execute on function public.fn_record_production_batch(uuid, timestamptz, jsonb) to authenticated;
