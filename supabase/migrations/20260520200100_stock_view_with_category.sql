-- =========================================================================
--  Tambah kolom kategori ke v_stock_per_location
--
--  PostgreSQL `create or replace view` HANYA mengizinkan penambahan kolom
--  di akhir SELECT (tidak boleh ubah urutan). Karena itu kolom kategori
--  ditaruh di paling belakang.
-- =========================================================================
create or replace view public.v_stock_per_location as
  select
    b.product_id,
    p.sku,
    p.name           as product_name,
    p.unit,
    p.is_perishable,
    b.location_id,
    l.code           as location_code,
    l.name           as location_name,
    sum(b.remaining_qty)              as total_qty,
    count(*) filter (where b.remaining_qty > 0) as active_batches,
    min(b.expires_at) filter (where b.expires_at is not null and b.remaining_qty > 0)
                                      as nearest_expiry,
    min(b.produced_at) filter (where b.remaining_qty > 0)
                                      as oldest_produced_at,
    -- Kolom baru di akhir agar create-or-replace tidak merubah urutan kolom existing.
    p.category_id,
    c.name           as category_name,
    c.icon           as category_icon,
    c.color          as category_color
  from public.stock_batches b
  join public.products  p on p.id = b.product_id
  join public.locations l on l.id = b.location_id
  left join public.product_categories c on c.id = p.category_id
  where b.remaining_qty > 0
  group by
    b.product_id, p.sku, p.name, p.unit, p.is_perishable,
    b.location_id, l.code, l.name,
    p.category_id, c.name, c.icon, c.color;

comment on view public.v_stock_per_location is
  'Ringkasan stok aktif per produk+lokasi (termasuk kategori).';

grant select on public.v_stock_per_location to authenticated;
