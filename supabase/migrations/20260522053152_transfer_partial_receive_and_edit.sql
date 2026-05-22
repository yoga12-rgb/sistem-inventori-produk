-- =========================================================================
-- Transfer — Partial receive, transit loss, and edit items while pending
--
-- Konteks lapangan:
--   * Sopir bawa 50 croissant, sampai outlet ternyata 47 (3 hancur di motor).
--     Sebelumnya kasir terpaksa konfirmasi semua 50 lalu disposal 3 — sumber
--     kebenaran hilang.
--   * Setelah transfer dibuat, kadang ada koreksi qty/item yang harus dilakukan
--     selama belum dikirim (status pending).
--
-- Penambahan:
--   * Enum `transfer_loss` di stock_movement_type untuk susut transit di
--     lokasi asal (akuntabilitas pengirim).
--   * Kolom `received_qty` & `loss_reason` pada transfer_items.
--     - received_qty = qty fisik yang diterima penerima.
--     - loss_qty turunan = quantity - received_qty.
--   * fn_confirm_transfer ditambah parameter opsional `p_items jsonb` untuk
--     terima parsial. Tanpa param, perilaku lama (semua diterima utuh).
--   * fn_update_transfer_items — edit qty/item selama status pending.
-- =========================================================================

-- ---------- 1. Enum transfer_loss ----------------------------------------
alter type public.stock_movement_type add value if not exists 'transfer_loss';

-- ---------- 2. Kolom baru di transfer_items ------------------------------
alter table public.transfer_items
  add column if not exists received_qty numeric(14,3),
  add column if not exists loss_reason  text;

-- received_qty boleh null saat masih pending; setelah confirm wajib terisi.
-- Constraint: 0 <= received_qty <= quantity (kalau ada).
alter table public.transfer_items
  drop constraint if exists transfer_items_received_qty_range;
alter table public.transfer_items
  add  constraint transfer_items_received_qty_range
       check (
         received_qty is null
         or (received_qty >= 0 and received_qty <= quantity)
       );

-- ---------- 3. fn_confirm_transfer dengan partial receive ---------------
-- Signature baru: param opsional `p_items jsonb` berisi
--   [{ "item_id": uuid, "received_qty": int, "loss_reason"?: text }, ...]
-- Kalau p_items NULL atau []: perilaku lama (terima utuh, received_qty =
-- quantity untuk semua item).
create or replace function public.fn_confirm_transfer(
  p_transfer_id uuid,
  p_items       jsonb default null
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
  v_item        record;
  v_src         record;
  v_dest        uuid;
  v_received    numeric;
  v_loss        numeric;
  v_reason      text;
  v_override    jsonb;
  v_ids         uuid[];
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

  -- Validasi p_items kalau diisi: harus array, dan setiap entry punya
  -- item_id valid milik transfer ini, received_qty dalam rentang [0, qty].
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'Format p_items harus array';
  end if;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    -- Cek semua item_id valid.
    select array_agg(id) into v_ids
      from public.transfer_items
     where transfer_id = p_transfer_id;

    for v_override in select * from jsonb_array_elements(p_items)
    loop
      if (v_override->>'item_id')::uuid is null then
        raise exception 'item_id wajib di setiap entry p_items';
      end if;
      if not (v_override->>'item_id')::uuid = any(v_ids) then
        raise exception 'item_id % bukan milik transfer ini', v_override->>'item_id';
      end if;
      v_received := coalesce((v_override->>'received_qty')::numeric, 0);
      if v_received < 0 then
        raise exception 'received_qty tidak boleh negatif';
      end if;
      if v_received <> floor(v_received) then
        raise exception 'received_qty harus bilangan bulat';
      end if;
    end loop;
  end if;

  -- Buat batch tujuan untuk tiap item, jumlah = received_qty.
  -- Bila received_qty < quantity, selisih di-log sebagai 'transfer_loss'
  -- di lokasi ASAL (akuntabilitas pengirim, tidak menambah/mengurangi
  -- batch karena sudah di-deduct saat create_transfer).
  for v_item in
    select * from public.transfer_items where transfer_id = p_transfer_id
  loop
    if v_item.destination_batch_id is not null then
      continue; -- idempotent
    end if;

    -- Tentukan received_qty & loss_reason untuk item ini.
    if p_items is not null then
      select (e->>'received_qty')::numeric, e->>'loss_reason'
        into v_received, v_reason
        from jsonb_array_elements(p_items) e
       where (e->>'item_id')::uuid = v_item.id
       limit 1;
    end if;

    -- Default = qty asli (terima utuh) kalau tidak di-override.
    if v_received is null then
      v_received := v_item.quantity;
      v_reason   := null;
    end if;

    v_loss := v_item.quantity - v_received;

    select * into v_src from public.stock_batches where id = v_item.source_batch_id;
    if v_src.id is null then
      raise exception 'Batch sumber pada item transfer tidak ditemukan';
    end if;

    -- Buat batch tujuan kalau ada qty yang diterima.
    if v_received > 0 then
      insert into public.stock_batches (
        product_id, location_id, produced_at, expires_at,
        initial_qty, remaining_qty, source_batch_id, notes, created_by
      ) values (
        v_item.product_id, v_t.to_location_id,
        v_src.produced_at, v_src.expires_at,
        v_received, v_received, v_src.id,
        'Hasil transfer ' || v_t.code, v_user
      )
      returning id into v_dest;

      insert into public.stock_movements (
        batch_id, product_id, location_id, movement_type, quantity,
        occurred_at, reference_type, reference_id, notes, created_by
      ) values (
        v_dest, v_item.product_id, v_t.to_location_id,
        'transfer_in', v_received, now(),
        'transfer', p_transfer_id,
        'Transfer ' || v_t.code, v_user
      );
    else
      v_dest := null;
    end if;

    -- Kalau ada selisih (loss), log movement transfer_loss di asal.
    -- Tidak menyentuh batch (qty sudah di-deduct saat create_transfer).
    if v_loss > 0 then
      insert into public.stock_movements (
        batch_id, product_id, location_id, movement_type, quantity,
        occurred_at, reference_type, reference_id, notes, created_by
      ) values (
        v_src.id, v_item.product_id, v_t.from_location_id,
        'transfer_loss', v_loss, now(),
        'transfer', p_transfer_id,
        coalesce(v_reason, 'Susut transit') || ' — Transfer ' || v_t.code,
        v_user
      );
    end if;

    -- Update transfer_items dengan received_qty & loss_reason aktual.
    update public.transfer_items
       set destination_batch_id = v_dest,
           received_qty = v_received,
           loss_reason  = nullif(trim(v_reason), '')
     where id = v_item.id;

    -- Reset variabel untuk iterasi berikutnya.
    v_received := null;
    v_reason   := null;
  end loop;

  update public.transfers
     set status = 'received',
         received_at = now(),
         confirmed_by = v_user,
         shipped_at = coalesce(shipped_at, now())
   where id = p_transfer_id;
end;
$$;

grant execute on function public.fn_confirm_transfer(uuid, jsonb) to authenticated;

-- Drop signature lama (1 param) supaya tidak ambigu di overload — fungsi
-- baru di atas sudah punya default null, jadi pemanggilan single-param
-- tetap kompatibel.
drop function if exists public.fn_confirm_transfer(uuid);

-- ---------- 4. fn_update_transfer_items: edit saat pending ---------------
-- Sender (atau super admin) boleh edit qty / hapus / tambah item selama
-- transfer masih `pending` (BELUM dikirim).
--
-- p_items: [
--   { "item_id"?: uuid, "source_batch_id": uuid, "quantity": int },
--   ...
-- ]
--   - item_id ada  → update existing item ke qty baru.
--   - item_id null → tambah item baru.
--   - item lama yang TIDAK ada di p_items → dihapus.
--
-- Implementasi: untuk simplicity & konsistensi stok, kita pakai
-- "rebuild" — kembalikan semua qty lama ke batch sumber, lalu deduct
-- ulang sesuai p_items. Performansi cukup karena items per transfer
-- biasanya kecil (<20).
create or replace function public.fn_update_transfer_items(
  p_transfer_id uuid,
  p_items       jsonb
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
  v_old         record;
  v_src         record;
  v_new         jsonb;
  v_qty         numeric;
  v_dest_batch  uuid;
begin
  if v_user is null then raise exception 'Tidak terotentikasi'; end if;
  select role, outlet_id into v_role, v_user_outlet
    from public.profiles where id = v_user;

  select * into v_t from public.transfers where id = p_transfer_id for update;
  if v_t.id is null then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status <> 'pending' then
    raise exception 'Hanya transfer berstatus pending yang dapat diedit';
  end if;
  if v_role <> 'super_admin' and v_user_outlet is distinct from v_t.from_location_id then
    raise exception 'Hanya pengirim yang bisa mengedit transfer';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item';
  end if;

  -- 1) Kembalikan semua qty lama ke batch sumber (rebuild).
  for v_old in
    select * from public.transfer_items where transfer_id = p_transfer_id
  loop
    update public.stock_batches
       set remaining_qty = remaining_qty + v_old.quantity
     where id = v_old.source_batch_id;
  end loop;

  -- 2) Hapus stock_movements transfer_out yang dulu kita catat,
  --    dan transfer_items lama. Item baru akan di-insert ulang.
  delete from public.stock_movements
   where reference_type = 'transfer'
     and reference_id   = p_transfer_id
     and movement_type  = 'transfer_out';

  delete from public.transfer_items where transfer_id = p_transfer_id;

  -- 3) Insert ulang sesuai p_items, deduct stok.
  for v_new in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_new->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> floor(v_qty) then
      raise exception 'Kuantitas item tidak valid (harus bilangan bulat ≥ 1)';
    end if;

    select * into v_src
      from public.stock_batches
      where id = (v_new->>'source_batch_id')::uuid
      for update;
    if v_src.id is null then
      raise exception 'Batch sumber tidak ditemukan';
    end if;
    if v_src.location_id <> v_t.from_location_id then
      raise exception 'Batch tidak berada di lokasi asal transfer';
    end if;
    if v_src.remaining_qty < v_qty then
      raise exception 'Stok batch hanya % unit', v_src.remaining_qty;
    end if;

    update public.stock_batches
       set remaining_qty = remaining_qty - v_qty
     where id = v_src.id;

    insert into public.stock_movements (
      batch_id, product_id, location_id, movement_type, quantity,
      occurred_at, reference_type, reference_id, notes, created_by
    ) values (
      v_src.id, v_src.product_id, v_t.from_location_id,
      'transfer_out', v_qty, now(), 'transfer', p_transfer_id,
      'Edit transfer ' || v_t.code, v_user
    );

    insert into public.transfer_items (
      transfer_id, source_batch_id, product_id, quantity, destination_batch_id
    ) values (
      p_transfer_id, v_src.id, v_src.product_id, v_qty, null
    );
  end loop;
end;
$$;

grant execute on function public.fn_update_transfer_items(uuid, jsonb) to authenticated;

-- ---------- 5. Inventory Matrix: tampilkan transfer_loss --------------
-- Tambah kolom `transfer_loss` ke composite type & view.
do $$
begin
  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'public.inventory_matrix_row'::regtype
       and a.attname  = 'transfer_loss'
  ) then
    alter type public.inventory_matrix_row
      add attribute transfer_loss numeric;
  end if;
end$$;

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
   order by p.name, l.code;
end;
$$;
