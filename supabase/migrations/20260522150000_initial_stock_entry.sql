-- =========================================================================
--  Initial Stock Entry — Go-Live Helper
--
--  Tujuan:
--    Membantu pengguna mengisi stok awal di setiap outlet saat pertama
--    kali migrasi dari sistem manual ke aplikasi ini.
--
--  Cara kerja:
--    Function `fn_initial_stock_entry` membuat batch baru + movement
--    `adjustment_in` di lokasi mana pun (tidak terbatas central_kitchen).
--    Hanya Super Admin yang bisa memanggil.
--
--  Keamanan:
--    - `security invoker` agar RLS user tetap dievaluasi.
--    - Super Admin memanggil lewat server action yang sudah gating
--      `requireSuperAdmin()`.
-- =========================================================================

create or replace function public.fn_initial_stock_entry(
  p_location_id  uuid,
  p_product_id   uuid,
  p_quantity     numeric,
  p_produced_at  timestamptz default null,
  p_expires_at   timestamptz default null,
  p_notes        text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_perishable  boolean;
  v_batch_id    uuid;
  v_user        uuid := auth.uid();
begin
  -- Validasi quantity
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Kuantitas harus > 0';
  end if;

  -- Validasi lokasi
  if not exists (select 1 from public.locations where id = p_location_id and is_active = true) then
    raise exception 'Lokasi tidak ditemukan atau tidak aktif';
  end if;

  -- Validasi produk
  select is_perishable into v_perishable
    from public.products where id = p_product_id and is_active = true;
  if v_perishable is null then
    raise exception 'Produk tidak ditemukan atau tidak aktif';
  end if;

  -- Untuk perishable, produced_at wajib diisi
  if v_perishable and p_produced_at is null then
    raise exception 'Tanggal produksi wajib diisi untuk produk perishable';
  end if;

  -- Insert batch
  insert into public.stock_batches (
    product_id, location_id, produced_at, expires_at,
    initial_qty, remaining_qty, notes, created_by
  ) values (
    p_product_id,
    p_location_id,
    coalesce(p_produced_at, now()),
    case when v_perishable then p_expires_at else null end,
    p_quantity,
    p_quantity,
    p_notes,
    v_user
  )
  returning id into v_batch_id;

  -- Log movement sebagai adjustment_in
  insert into public.stock_movements (
    batch_id, product_id, location_id, movement_type, quantity,
    occurred_at, reference_type, reference_id, notes, created_by
  ) values (
    v_batch_id,
    p_product_id,
    p_location_id,
    'adjustment_in',
    p_quantity,
    coalesce(p_produced_at, now()),
    'initial_stock',
    v_batch_id,
    p_notes,
    v_user
  );

  return v_batch_id;
end;
$$;
