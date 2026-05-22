# 📄 Product Requirements Document (PRD) - Update 11

Sistem Manajemen Inventaris & Penjualan Multi-Outlet Real-time

> Update 11 menambahkan Void Sale (pembatalan transaksi), Transfer Partial Receive,
> Edit Transfer Items saat pending, Transfer Code Format baru, EOD performance
> indexes, dan perbaikan RLS profiles.

## 1. Ringkasan Proyek

Aplikasi berbasis web untuk manajemen inventaris, produksi, dan transfer stok antar outlet. Dioptimalkan untuk penggunaan tablet oleh kasir dengan responsivitas penuh untuk laptop (Super Admin). Menggunakan arsitektur Single Page Application (SPA) agar navigasi terasa instan.

Fokus: **manajemen stok**. Aplikasi TIDAK mencatat harga, metode pembayaran, atau pajak.

## 2. Tech Stack

Framework: Next.js 16 (App Router, Turbopack default)

Database & Backend: Supabase (PostgreSQL, Auth, Realtime WebSockets)

Deployment: Vercel

UI Components: Tailwind CSS v4, komponen utility custom (ala Shadcn)

Form Management & Validation: React Hook Form + Zod

State & Caching: Local Storage / Session Storage (filter UI), Supabase cache (data)

Theming: next-themes (class strategy), aksen ORANYE.

## 3. Panduan UI/UX

Desain: Sederhana, bersih, dan jelas (Clean UI).

Aksesibilitas Utama: Tablet-first (Kasir) & Responsive untuk Desktop/Laptop (Super Admin).

Tema: Mendukung Dark Mode dan Light Mode.

Warna Utama: Aksen Oranye (sebagai warna tombol utama, notifikasi, dan highlight).

Performa Navigasi: Transisi antar menu terasa seperti aplikasi native (SPA) — memanfaatkan prefetch `next/link`.

## 4. Peran dan Hak Akses (Role Management)

Super Admin:

- Akses penuh ke semua fitur dan outlet.
- Menambahkan, mengedit, dan menonaktifkan Outlet.
- Membuat akun Kasir (login email + password Supabase Auth) dan menugaskan mereka ke outlet tertentu. Tidak ada self-signup.
- Mengubah master data (varian, flag `is_perishable`, masa ketahanan default, threshold warning, persen diskon otomatis).
- Melihat dashboard dan perubahan data secara real-time.
- Void transaksi penjualan kapan saja (outlet mana pun).
- Edit item transfer saat status pending (asal mana pun).

Kasir:

- Akses spesifik berdasarkan Outlet ID yang ditugaskan.
- Bisa melihat stok dan penjualan di semua outlet.
- Hanya bisa melakukan transfer KELUAR untuk outlet mereka sendiri; bisa konfirmasi/menolak transfer MASUK ke outletnya.
- Membuat End of Day (EOD) Report dan membagikannya ke WhatsApp via `wa.me`.
- Void transaksi penjualan miliknya sendiri di hari yang sama.
- Edit item transfer yang dia buat saat status pending.
- Konfirmasi transfer dengan qty parsial (partial receive).

## 5. Fitur Inti

### 5.1 Manajemen Produk (Perishable vs Non-Perishable)

- Setiap **varian = produk independen** dengan SKU sendiri.
- Setiap produk memiliki tanda `is_perishable`.
- Barang Perishable (Makanan): Wajib melacak SKU, tanggal & jam produksi.
  Memiliki masa ketahanan (shelf life) yang **dapat di-override per batch** sesuai
  produksi aktual; default diambil dari master varian (`default_shelf_life_hours`).
  Threshold warning expired & persen saran diskon dikonfigurasi per varian.
- Barang Non-Perishable (Kardus, Kemasan): Tidak memiliki masa ketahanan.
  Pemasukan stok dicatat berdasarkan tanggal masuk saja tanpa memicu logika kedaluwarsa.

### 5.2 Logika Pemotongan Stok (FIFO & Override Manual)

- **Otomatis (FIFO)**: untuk pengurangan non-transfer (penjualan, expired, rusak,
  adjustment minus), sistem memotong dari batch dengan `produced_at` tertua
  (untuk perishable) atau tanggal masuk tertua (non-perishable).
- **Manual Override**: kasir memiliki dropdown opsional untuk memilih batch
  spesifik yang akan dipotong.

### 5.3 Sistem Notifikasi Kedaluwarsa & Diskon

- Hanya berlaku untuk barang Perishable.
- Sistem mendeteksi batch yang mendekati expired (≤ `expiry_warning_hours`),
  memunculkan **warning UI yang persisten** sampai kasir mengambil tindakan
  (jual, buang, atau tandai sebagai expired/damage).
- Sistem memberikan **saran diskon** sebesar `expiry_discount_percent` produk.
  Saran ini bersifat informatif (PRD ini tidak mencatat harga).

### 5.4 Sumber Produksi & Aliran Stok

- **Central Pastry** adalah satu-satunya tempat produksi. Pemasukan stok
  non-perishable juga di-default ke Central Pastry.
- Distribusi ke outlet selalu lewat fitur Transfer (lihat 5.5).

### 5.5 Transfer Antar Outlet

Tiap transfer punya `mode`:

- **Two-Way (default)**: butuh konfirmasi penerima.
  Alur: `pending → in_transit → received | rejected | cancelled`.
- **One-Way**: langsung jadi (status `received`) tanpa konfirmasi.

Aturan:

- Batch & `produced_at` ikut terbawa ke outlet tujuan (batch tujuan mewarisi
  `expires_at` dari sumber).
- Kasir hanya boleh **inisiasi** transfer dari outletnya sendiri.
- Kasir **boleh konfirmasi** transfer masuk ke outletnya.

**Partial Receive (Update 11)**:

- Penerima dapat mengkonfirmasi dengan `received_qty` per item (0 ≤ qty ≤ kiriman).
- Selisih dicatat sebagai `transfer_loss` di lokasi asal.
- Tidak perlu disposal manual untuk susut transit.

**Edit Transfer (Update 11)**:

- Pengirim dapat mengedit qty/item transfer selama status `pending`.
- Rebuild strategy: stok lama dikembalikan, stok baru di-deduct ulang.

**Format Kode (Update 11)**:

- Format: `TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD`
- Contoh: `TR-PRO-CLD-1-2026-05-22`
- Counter monotonik per pasangan+tgl, anti race dengan advisory lock.

### 5.6 Penjualan (Multi-Item)

- Satu transaksi penjualan dapat berisi >1 varian.
- Field input: produk + qty (+ override batch opsional).
- Multi-batch split per item: support FIFO auto + manual batch assignment.
- Tidak ada harga, metode pembayaran, atau pajak.

**Void Sale (Update 11)**:

- Kasir/admin dapat membatalkan transaksi penjualan.
- Soft delete: sale tetap di DB dengan `voided_at`, voided_by, void_reason.
- Reversal stok: stok dikembalikan ke batch asal via movement `sale_void`.
- Permission: super admin void kapan saja; kasir hanya transaksi sendiri hari yang sama.
- Idempotent: void dua kali tidak berefek.

### 5.7 EOD Report (WhatsApp)

Format text contoh:

```
Terjual
Sapi Original : 5 Box

Stock Update
Sapi Original : 4 Box
  Tanggal 18 Mei : 2 Box
  Tanggal 17 Mei : 2 Box
Sapi Pedas : 1 Box
  Tanggal 17 Mei : 1 Box
```

Tombol "Bagikan ke WhatsApp" membuka `https://wa.me/?text=<encoded>` agar user
memilih kontak/grup tujuan secara manual.

Data penjualan sudah termasuk void reversal (sold = sale_out - sale_void).

### 5.8 Inventory Matrix Table (Laporan Harian per Tanggal)

- Meringkas: Stok Awal, Masuk, Transfer In, Transfer Out, Transfer Loss, Terjual, Expired,
  Compliment, Tester, Rusak, Stok Akhir.
- Filter outlet: **single outlet** atau **semua outlet**. Filter tersimpan di
  `localStorage`.
- Interaksi UI: Hover untuk lihat detail batch/riwayat transfer; klik untuk
  modal detail.
- Sold = sale_out - sale_void (NET).
- Transfer loss mengurangi stok di lokasi asal.
- Export (Excel/PDF/CSV) ditunda — bukan scope iterasi awal.

### 5.9 Sinkronisasi Real-time

- Menggunakan Supabase Realtime (WebSockets) untuk memperbarui UI seketika
  saat ada perubahan `stock_batches`, `stock_movements`, `sales`, `sale_items`,
  `transfers`, `transfer_items`.

## 6. Database & Performa

- **Pengembangan Lokal**: Supabase CLI + Docker dengan sistem migrations
  (`supabase/migrations/`). DILARANG manual SQL execution di dashboard cloud.
- **Indexing**: index pada `outlet_id`, `sku`, `production_date` (= `produced_at`),
  ditambah index FIFO partial (`product_id, location_id, produced_at` where
  `remaining_qty > 0`). Index EOD composite: `(location_id, movement_type, occurred_at desc)`.
  Partial index sale_out: `(location_id, occurred_at desc) where movement_type = 'sale_out'`.
- **Auth**: Email + password Supabase Auth standar; session di-refresh oleh
  `proxy.ts` (Next.js 16 menggantikan `middleware.ts`).

## 7. Catatan Build (Next.js 16)

- `cookies()`, `headers()`, `params`, dan `searchParams` adalah Promise — wajib di-`await`.
- File `middleware.ts` → `proxy.ts`, fungsi `middleware` → `proxy`. Hanya runtime Node, tanpa edge.
- Turbopack adalah default untuk `dev` dan `build`.
- Tailwind v4 menggunakan `@import "tailwindcss"` + `@theme inline { … }`,
  bukan `tailwind.config.js`.

## 8. Keputusan Hasil Diskusi (untuk audit trail)

| #   | Topik                    | Keputusan                                                                                 |
| --- | ------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | Katalog produk           | Terpusat (master tunggal)                                                                 |
| 2   | Produksi                 | Hanya di Central Pastry, lalu di-transfer                                                 |
| 3   | Shelf life               | Master per varian + override per batch                                                    |
| 4   | Warning expired          | Persisten sampai kasir input tindakan                                                     |
| 5   | Mode transfer            | Two-way (default, butuh konfirmasi) + One-way                                             |
| 6   | Penjualan                | Multi-item per transaksi, tanpa harga/pembayaran/pajak                                    |
| 7   | EOD share                | `wa.me/?text=…` (pilih kontak manual)                                                     |
| 8   | Filter Inventory Matrix  | Single/all outlet, persist di localStorage                                                |
| 9   | Auth                     | Supabase Auth standar; akun kasir dibuat oleh Super Admin                                 |
| 10  | Varian                   | Tiap varian = produk independen, SKU sendiri                                              |
| 11  | Export laporan           | Ditunda (bukan iterasi awal)                                                              |
| 12  | Disposal categories      | Expired, Compliment, Tester, Rusak di UI. Adjustment hanya internal (pembatalan transfer) |
| 13  | Kategori produk          | Tabel master terpisah, nullable FK di products, CRUD Super Admin only                     |
| 14  | POS layout               | Two-column (product grid + sticky cart), mobile bottom sheet                              |
| 15  | Multi-batch split        | Cart model `splits[]` per item, FIFO preview + manual mode                                |
| 16  | Void sale                | Soft delete + reversal stok. Kasir: milik sendiri hari sama. Admin: bebas                 |
| 17  | Transfer partial receive | `received_qty` per item, `transfer_loss` di lokasi asal                                   |
| 18  | Edit transfer pending    | Rebuild strategy: kembali + deduct ulang                                                  |
| 19  | Transfer code format     | `TR-[ASAL]-[TUJUAN]-[N]-TANGGAL`, monotonik + advisory lock                               |
| 20  | RLS profiles             | Longgar: semua authenticated user bisa SELECT profiles                                    |

## 9. Status Implementasi (per Update 11)

| Iterasi | Cakupan                                                                                     | Status     |
| ------- | ------------------------------------------------------------------------------------------- | ---------- |
| 0       | Skeleton (Next 16, Supabase, Auth, Theme, RLS skema awal)                                   | ✅ Selesai |
| 1       | Master Data (Outlet, Produk, Pengguna) oleh Super Admin                                     | ✅ Selesai |
| 2       | Produksi (batch) + Stok Masuk + FIFO function                                               | ✅ Selesai |
| 3       | Transfer two-way / one-way + inbox konfirmasi                                               | ✅ Selesai |
| 4       | Penjualan multi-item + warning expired + EOD WhatsApp                                       | ✅ Selesai |
| 5       | Inventory Matrix harian per tanggal + filter persisten                                      | ✅ Selesai |
| 6       | Polishing, audit log, deploy production                                                     | ✅ Selesai |
| 7       | Disposal categories, POS redesign, multi-batch split, kategori produk, production history   | ✅ Selesai |
| 8       | Void Sale, Transfer Partial Receive & Edit, Transfer Code Format, EOD Indexes, RLS Profiles | ✅ Selesai |
