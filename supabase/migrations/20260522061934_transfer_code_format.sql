-- =========================================================================
-- Transfer code format
--
-- Format baru: TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD
-- Contoh:      TR-PRO-CLD-1-2026-05-22
--
-- Aturan:
--   * N = transfer keberapa untuk pasangan asal+tujuan pada hari itu (zona
--     Asia/Jakarta), dihitung berdasarkan created_at.
--   * Tanpa padding (1, 2, 3, ..., 10).
--   * Counter monotonik: transfer yang DIBATALKAN tetap menempati nomornya.
--     Membatalkan tidak menggeser counter berikutnya.
--   * Anti race-condition: pakai pg_advisory_xact_lock per (asal+tujuan+tgl)
--     supaya 2 transaksi parallel tidak dapat N yang sama.
-- =========================================================================

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
  v_from_code   text;
  v_to_code     text;
  v_now         timestamptz := now();
  v_today       date := (v_now at time zone 'Asia/Jakarta')::date;
  v_seq         integer;
  v_lock_key    bigint;
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

  -- Validasi dasar.
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

  -- Otorisasi pengirim.
  if v_role <> 'super_admin' and v_user_outlet is distinct from p_from_location_id then
    raise exception 'Anda hanya bisa transfer dari outlet sendiri';
  end if;

  -- Ambil kode lokasi.
  select code into v_from_code from public.locations where id = p_from_location_id;
  select code into v_to_code   from public.locations where id = p_to_location_id;
  if v_from_code is null or v_to_code is null then
    raise exception 'Lokasi tidak ditemukan';
  end if;

  -- Lock per pasangan (asal,tujuan,tanggal) supaya counter aman dari race.
  -- hashtextextended menerima text dan seed bigint → cocok untuk advisory lock.
  v_lock_key := hashtextextended(
    v_from_code || '>' || v_to_code || '>' || to_char(v_today, 'YYYYMMDD'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  -- N = jumlah transfer dengan pasangan asal+tujuan yang sudah ada di
  -- tanggal yang sama (Asia/Jakarta), berdasarkan created_at, + 1.
  -- Cancelled tetap dihitung supaya counter monotonik.
  select count(*) + 1 into v_seq
    from public.transfers
   where from_location_id = p_from_location_id
     and to_location_id   = p_to_location_id
     and (created_at at time zone 'Asia/Jakarta')::date = v_today;

  v_code := 'TR-' || v_from_code || '-' || v_to_code || '-' ||
            v_seq::text || '-' || to_char(v_today, 'YYYY-MM-DD');

  insert into public.transfers (
    code, from_location_id, to_location_id, mode, status, notes,
    created_by, shipped_at, received_at
  ) values (
    v_code, p_from_location_id, p_to_location_id, p_mode,
    case when p_mode = 'one_way' then 'received'::transfer_status
         else 'pending'::transfer_status end,
    p_notes, v_user,
    case when p_mode = 'one_way' then v_now else null end,
    case when p_mode = 'one_way' then v_now else null end
  )
  returning id into v_transfer_id;

  -- Items: validasi & deduct stok asal (sama seperti sebelumnya).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
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
      'transfer_out', v_qty, v_now, 'transfer', v_transfer_id,
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
        'transfer_in', v_qty, v_now, 'transfer', v_transfer_id,
        'Transfer ' || v_code, v_user
      );

      update public.transfer_items
         set destination_batch_id = v_dest_batch,
             received_qty = v_qty
       where transfer_id = v_transfer_id
         and source_batch_id = v_batch.id
         and destination_batch_id is null;
    end if;
  end loop;

  return v_transfer_id;
end;
$$;
