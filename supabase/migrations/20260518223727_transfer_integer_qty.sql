-- =========================================================================
--  Enforce integer quantity for transfers
--
--  Aturan UX: jumlah yang dikirim antar lokasi harus bilangan bulat ≥ 1.
--  Batch quantity sendiri tetap numeric(14,3) karena produk lain (mis.
--  hasil produksi yang ditakar berat) bisa pecahan. Constraint ini hanya
--  pada `transfer_items` + validasi tambahan di `fn_create_transfer`.
-- =========================================================================

-- 1) Tambah CHECK constraint di transfer_items.
alter table public.transfer_items
  add constraint transfer_items_quantity_int_min1
    check (
      quantity = floor(quantity)
      and quantity >= 1
    );

-- 2) Validasi tambahan di fn_create_transfer agar pesan error lebih jelas
--    (tanpa CHECK constraint, qty 0.5 akan ditolak dengan generic Postgres
--    error). Replace function in-place.
create or replace function public.fn_create_transfer(
  p_from_location_id uuid,
  p_to_location_id   uuid,
  p_mode             transfer_mode,
  p_notes            text,
  p_items            jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_role        user_role;
  v_user_outlet uuid;
  v_transfer_id uuid;
  v_code        text;
  v_item        jsonb;
  v_batch       record;
  v_qty         numeric;
  v_dest_batch  uuid;
begin
  if v_user is null then
    raise exception 'Tidak terotentikasi';
  end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;
  if v_role is null then
    raise exception 'Profil tidak ditemukan';
  end if;

  -- Validasi dasar
  if p_from_location_id is null or p_to_location_id is null then
    raise exception 'Lokasi asal dan tujuan wajib diisi';
  end if;
  if p_from_location_id = p_to_location_id then
    raise exception 'Lokasi asal dan tujuan harus berbeda';
  end if;
  if p_mode is null then
    raise exception 'Mode transfer wajib diisi';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item';
  end if;

  -- Otorisasi pengirim
  if v_role <> 'super_admin' and v_user_outlet is distinct from p_from_location_id then
    raise exception 'Anda hanya bisa transfer dari outlet sendiri';
  end if;

  v_code := 'TR-' ||
            to_char(now(), 'YYMMDDHH24MISS') || '-' ||
            substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  insert into public.transfers (
    code, from_location_id, to_location_id, mode, status, notes,
    created_by, shipped_at, received_at
  ) values (
    v_code, p_from_location_id, p_to_location_id, p_mode,
    case when p_mode = 'one_way' then 'received'::transfer_status
         else 'pending'::transfer_status end,
    p_notes, v_user,
    case when p_mode = 'one_way' then now() else null end,
    case when p_mode = 'one_way' then now() else null end
  )
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;

    -- Validasi qty: bilangan bulat, minimal 1.
    if v_qty is null or v_qty <= 0 then
      raise exception 'Kuantitas item tidak valid (harus > 0)';
    end if;
    if v_qty <> floor(v_qty) then
      raise exception 'Kuantitas transfer harus bilangan bulat';
    end if;
    if v_qty < 1 then
      raise exception 'Kuantitas minimal 1';
    end if;

    select * into v_batch
      from public.stock_batches
      where id = (v_item->>'source_batch_id')::uuid
      for update;

    if v_batch.id is null then
      raise exception 'Batch sumber tidak ditemukan';
    end if;
    if v_batch.location_id <> p_from_location_id then
      raise exception 'Batch tidak berada di lokasi asal';
    end if;
    if v_batch.remaining_qty < v_qty then
      raise exception 'Stok batch hanya % unit', v_batch.remaining_qty;
    end if;

    update public.stock_batches
       set remaining_qty = remaining_qty - v_qty
     where id = v_batch.id;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_batch.id, v_batch.product_id, p_from_location_id,
      'transfer_out', v_qty, now(), 'transfer', v_transfer_id,
      'Transfer ' || v_code, v_user
    );

    insert into public.transfer_items (
      transfer_id, source_batch_id, product_id, quantity, destination_batch_id
    ) values (
      v_transfer_id, v_batch.id, v_batch.product_id, v_qty, null
    );

    if p_mode = 'one_way' then
      insert into public.stock_batches (
        product_id, location_id, produced_at, expires_at,
        initial_qty, remaining_qty, source_batch_id, notes, created_by
      ) values (
        v_batch.product_id, p_to_location_id,
        v_batch.produced_at, v_batch.expires_at,
        v_qty, v_qty, v_batch.id,
        'Hasil transfer ' || v_code, v_user
      )
      returning id into v_dest_batch;

      insert into public.stock_movements (
        batch_id, product_id, location_id, movement_type, quantity,
        occurred_at, reference_type, reference_id, notes, created_by
      ) values (
        v_dest_batch, v_batch.product_id, p_to_location_id,
        'transfer_in', v_qty, now(), 'transfer', v_transfer_id,
        'Transfer ' || v_code, v_user
      );

      update public.transfer_items
         set destination_batch_id = v_dest_batch
       where transfer_id = v_transfer_id
         and source_batch_id = v_batch.id
         and destination_batch_id is null;
    end if;
  end loop;

  return v_transfer_id;
end;
$$;
