-- =========================================================================
--  Longgarkan RLS profiles: semua user authenticated boleh baca.
--
--  Konteks: query gabungan di halaman /penjualan, /produksi (riwayat),
--  /aktivitas, /transfer/[id], dan /eod sering join `profiles` untuk
--  menampilkan nama aktor (kasir/admin yang melakukan transaksi).
--
--  Policy lama `profiles_self_read` membatasi baca ke "id = auth.uid() OR
--  is_super_admin()", sehingga kasir tidak bisa melihat nama kasir/admin
--  lain. PostgREST menerjemahkan ini menjadi inner join kosong → seluruh
--  baris movement/sale/transfer tampak hilang dari sisi kasir.
--
--  Keputusan: di app POS internal seperti ini, nama pengguna tidak rahasia
--  (sudah tertulis di banyak tampilan). Email & role tetap sensitif —
--  policy ini hanya melonggarkan SELECT, bukan UPDATE/DELETE. Aksi tulis
--  tetap dibatasi `profiles_admin_write` (super admin only).
-- =========================================================================
drop policy if exists "profiles_self_read" on public.profiles;

create policy "profiles_read_all_auth"
  on public.profiles for select
  to authenticated using (true);
