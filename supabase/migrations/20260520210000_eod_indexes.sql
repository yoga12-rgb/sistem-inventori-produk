-- =========================================================================
--  Index untuk EOD report & inventory matrix per kategori
--
--  Background: query `fn_eod_report` dan `fn_inventory_matrix` sering
--  memfilter `stock_movements` dengan kombinasi:
--    - location_id  (equality)
--    - movement_type (equality atau IN list)
--    - occurred_at  (range)
--
--  Index existing `idx_movements_loc_date(location_id, occurred_at desc)`
--  membuat `movement_type` jadi post-index Filter — tidak optimal saat
--  outlet sangat sibuk (banyak movement non-sale_out di hari yang sama).
--
--  Solusi: composite index dengan urutan kolom (equality dulu, range
--  paling akhir) sesuai aturan B-tree:
--    1. location_id    (equality → cardinalitas tertinggi pertama)
--    2. movement_type  (equality)
--    3. occurred_at    (range, DESC untuk EOD ordering)
-- =========================================================================

-- 1) Composite index — covers semua EOD/Matrix aggregation per kategori.
create index if not exists idx_movements_eod_lookup
  on public.stock_movements (location_id, movement_type, occurred_at desc);

-- 2) Partial index khusus penjualan — ini section paling sering dipakai
--    (riwayat /penjualan + EOD Terjual + Matrix Terjual). Ukurannya jauh
--    lebih kecil dari composite di atas karena hanya men-index baris
--    bertipe sale_out, sehingga lookup-nya super cepat di outlet besar.
create index if not exists idx_movements_sale_out
  on public.stock_movements (location_id, occurred_at desc)
  where movement_type = 'sale_out';

comment on index public.idx_movements_eod_lookup is
  'Mendukung fn_eod_report (per kategori) dan fn_inventory_matrix per movement_type.';

comment on index public.idx_movements_sale_out is
  'Partial index untuk lookup penjualan — section terbesar di EOD & riwayat /penjualan.';
