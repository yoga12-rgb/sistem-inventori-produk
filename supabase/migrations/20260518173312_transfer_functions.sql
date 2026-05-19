-- =========================================================================
--  Transfer Functions — Iterasi 3
--
--  Fungsi:
--   * fn_create_transfer    — buat transfer (two_way pending atau one_way received)
--   * fn_confirm_transfer   — penerima konfirmasi: bikin batch tujuan + transfer_in
--   * fn_ship_transfer      — penanda fisik dikirim (pending → in_transit)
--   * fn_cancel_transfer    — pengirim batalkan, stok sumber dikembalikan
--   * fn_reject_transfer    — penerima tolak, stok sumber dikembalikan
--
--  SECURITY: function memakai `security definer` agar bisa menulis batch
--  ke lokasi tujuan (yang bukan outlet pemanggil). Setiap function MELAKUKAN
--  pengecekan auth eksplisit di awal sebelum bypass RLS.
-- =========================================================================

-- ---------- helper: cari profil user saat ini ---------------------------
create or replace function public._tx_current_profile()
returns table (user_id uuid, role user_role, outlet_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.role, p.outlet_id
    from public.profiles p
   where p.id = auth.uid();
$$;

-- ---------- fn_create_transfer ------------------------------------------
create or replace function public.fn_create_transfer(
  p_from_location_id uuid,
  p_to_location_id   uuid,
  p_mode             transfer_mode,
  p_notes            text,
  p_items            jsonb       -- [{source_batch_id, quantity}, ...]
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

  -- Generate kode transfer (waktu + 4 char acak)
  v_code := 'TR-' ||
            to_char(now(), 'YYMMDDHH24MISS') || '-' ||
            substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  -- Header transfer
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

  -- Iterasi item: validasi, kunci, kurangi sumber, log transfer_out
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Kuantitas item tidak valid';
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

    -- Decrement sumber
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

    -- One-way: langsung buat batch tujuan + log transfer_in
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

-- ---------- fn_ship_transfer ---------------------------------------------
create or replace function public.fn_ship_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_role        user_role;
  v_user_outlet uuid;
  v_t           record;
begin
  if v_user is null then raise exception 'Tidak terotentikasi'; end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;

  select * into v_t from public.transfers where id = p_transfer_id for update;
  if v_t.id is null then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.mode <> 'two_way' then
    raise exception 'Hanya transfer two-way yang menggunakan tahap pengiriman';
  end if;
  if v_t.status <> 'pending' then
    raise exception 'Transfer tidak dalam status pending';
  end if;
  if v_role <> 'super_admin' and v_user_outlet is distinct from v_t.from_location_id then
    raise exception 'Hanya pengirim yang bisa menandai dikirim';
  end if;

  update public.transfers
     set status = 'in_transit', shipped_at = now()
   where id = p_transfer_id;
end;
$$;

-- ---------- fn_confirm_transfer ------------------------------------------
create or replace function public.fn_confirm_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_role        user_role;
  v_user_outlet uuid;
  v_t           record;
  v_item        record;
  v_src         record;
  v_dest        uuid;
begin
  if v_user is null then raise exception 'Tidak terotentikasi'; end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;

  select * into v_t from public.transfers where id = p_transfer_id for update;
  if v_t.id is null then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.mode <> 'two_way' then
    raise exception 'Transfer one-way tidak perlu konfirmasi';
  end if;
  if v_t.status not in ('pending', 'in_transit') then
    raise exception 'Transfer sudah selesai atau dibatalkan';
  end if;
  if v_role <> 'super_admin' and v_user_outlet is distinct from v_t.to_location_id then
    raise exception 'Hanya outlet penerima yang bisa konfirmasi';
  end if;

  -- Bikin batch tujuan untuk tiap item
  for v_item in
    select * from public.transfer_items where transfer_id = p_transfer_id
  loop
    if v_item.destination_batch_id is not null then
      continue; -- idempotent: sudah dibuat
    end if;

    select * into v_src from public.stock_batches where id = v_item.source_batch_id;
    if v_src.id is null then
      raise exception 'Batch sumber pada item transfer tidak ditemukan';
    end if;

    insert into public.stock_batches (
      product_id, location_id, produced_at, expires_at,
      initial_qty, remaining_qty, source_batch_id, notes, created_by
    ) values (
      v_item.product_id, v_t.to_location_id,
      v_src.produced_at, v_src.expires_at,
      v_item.quantity, v_item.quantity, v_src.id,
      'Hasil transfer ' || v_t.code, v_user
    )
    returning id into v_dest;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_dest, v_item.product_id, v_t.to_location_id,
      'transfer_in', v_item.quantity, now(),
      'transfer', p_transfer_id,
      'Transfer ' || v_t.code, v_user
    );

    update public.transfer_items
       set destination_batch_id = v_dest
     where id = v_item.id;
  end loop;

  update public.transfers
     set status = 'received',
         received_at = now(),
         confirmed_by = v_user,
         shipped_at = coalesce(shipped_at, now())
   where id = p_transfer_id;
end;
$$;

-- ---------- shared: kembalikan stok sumber + log adjustment_in ----------
-- Dipakai oleh cancel & reject. Param p_label muncul di catatan movement.
create or replace function public._tx_restore_source(
  p_transfer_id uuid,
  p_label       text,
  p_user        uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t     record;
  v_item  record;
  v_src   record;
begin
  select * into v_t from public.transfers where id = p_transfer_id;
  if v_t.id is null then raise exception 'Transfer tidak ditemukan'; end if;

  for v_item in
    select * from public.transfer_items where transfer_id = p_transfer_id
  loop
    -- Kembalikan stok ke batch sumber
    select * into v_src from public.stock_batches
      where id = v_item.source_batch_id for update;
    if v_src.id is null then
      raise exception 'Batch sumber sudah tidak ada — tidak dapat dipulihkan';
    end if;
    if v_src.remaining_qty + v_item.quantity > v_src.initial_qty then
      raise exception 'Pengembalian melebihi initial_qty batch sumber';
    end if;

    update public.stock_batches
       set remaining_qty = remaining_qty + v_item.quantity
     where id = v_src.id;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_src.id, v_item.product_id, v_t.from_location_id,
      'adjustment_in', v_item.quantity, now(),
      'transfer', p_transfer_id,
      p_label || ' ' || v_t.code, p_user
    );
  end loop;
end;
$$;

-- ---------- fn_cancel_transfer (sender) ---------------------------------
create or replace function public.fn_cancel_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_role        user_role;
  v_user_outlet uuid;
  v_t           record;
begin
  if v_user is null then raise exception 'Tidak terotentikasi'; end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;

  select * into v_t from public.transfers where id = p_transfer_id for update;
  if v_t.id is null then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status not in ('pending', 'in_transit') then
    raise exception 'Hanya transfer pending/in-transit yang bisa dibatalkan';
  end if;
  if v_role <> 'super_admin' and v_user_outlet is distinct from v_t.from_location_id then
    raise exception 'Hanya pengirim yang bisa membatalkan';
  end if;

  perform public._tx_restore_source(p_transfer_id, 'Pembatalan transfer', v_user);

  update public.transfers
     set status = 'cancelled'
   where id = p_transfer_id;
end;
$$;

-- ---------- fn_reject_transfer (receiver) -------------------------------
create or replace function public.fn_reject_transfer(
  p_transfer_id uuid,
  p_reason      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_role        user_role;
  v_user_outlet uuid;
  v_t           record;
begin
  if v_user is null then raise exception 'Tidak terotentikasi'; end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;

  select * into v_t from public.transfers where id = p_transfer_id for update;
  if v_t.id is null then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.mode <> 'two_way' then
    raise exception 'Transfer one-way tidak dapat ditolak';
  end if;
  if v_t.status not in ('pending', 'in_transit') then
    raise exception 'Transfer sudah selesai atau dibatalkan';
  end if;
  if v_role <> 'super_admin' and v_user_outlet is distinct from v_t.to_location_id then
    raise exception 'Hanya outlet penerima yang bisa menolak';
  end if;

  perform public._tx_restore_source(p_transfer_id, 'Penolakan transfer', v_user);

  update public.transfers
     set status = 'rejected',
         notes = coalesce(notes, '') ||
                 case when p_reason is not null and p_reason <> ''
                      then E'\nAlasan tolak: ' || p_reason
                      else '' end,
         confirmed_by = v_user
   where id = p_transfer_id;
end;
$$;

-- ---------- GRANTS -------------------------------------------------------
grant execute on function public.fn_create_transfer(uuid, uuid, transfer_mode, text, jsonb) to authenticated;
grant execute on function public.fn_ship_transfer(uuid)    to authenticated;
grant execute on function public.fn_confirm_transfer(uuid) to authenticated;
grant execute on function public.fn_cancel_transfer(uuid)  to authenticated;
grant execute on function public.fn_reject_transfer(uuid, text) to authenticated;
