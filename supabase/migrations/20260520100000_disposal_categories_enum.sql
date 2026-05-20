-- =========================================================================
--  Disposal categories — enum values
--
--  Menambahkan dua kategori baru ke `stock_movement_type`:
--    - compliment_out: barang dikeluarkan sebagai kompliment (gratis ke pelanggan)
--    - tester_out:     barang dikeluarkan untuk tester / sample
--
--  ALTER TYPE ... ADD VALUE WAJIB di-commit di transaksi terpisah sebelum
--  bisa dipakai sebagai literal di statement DDL berikutnya. Karena itu
--  enum diisolasi di migration sendiri.
-- =========================================================================
alter type public.stock_movement_type add value if not exists 'compliment_out';
alter type public.stock_movement_type add value if not exists 'tester_out';
