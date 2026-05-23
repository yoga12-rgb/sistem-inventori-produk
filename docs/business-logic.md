# Business Logic

## 1. Produksi, Pemasukan Stok & Initial Stock

- Hanya **Central Pastry** yang membuat batch baru via `production_in`.
- Outlet menerima stok melalui transfer (lihat §3).
- Untuk **non-perishable**, stok bisa di-`entry_in` di lokasi mana pun (default ke Central Pastry).
- Untuk **go-live / initial stock**, Super Admin bisa menggunakan halaman `/initial-stock`:
  - Function `fn_initial_stock_entry` membuat batch baru + movement `adjustment_in` di **lokasi mana pun** (tidak terbatas central kitchen)
  - Untuk produk **perishable**: tanggal produksi wajib diisi, expired auto-calculate dari shelf life
  - Untuk produk **non-perishable**: tanggal produksi & expired tidak diperlukan
  - Hanya Super Admin yang bisa mengakses — sudah di-gate via `requireSuperAdmin()` di server action

Saat insert `stock_batches`:

1. `tg_batch_set_expiry` mengisi `expires_at = produced_at + product.default_shelf_life_hours`
   bila perishable dan belum diisi manual.
2. Kasir/admin boleh **override per batch** — masukkan `expires_at` manual saat input produksi.

## 2. Pemotongan Stok (FIFO + Manual Override)

Berlaku untuk: `sale_out`, `expired_out`, `compliment_out`, `tester_out`, `damage_out`, `adjustment_out`.

```
function deduct(product_id, location_id, qty, override_batch_id?):
  if override_batch_id is set:
    use that batch (validasi qty <= remaining_qty)
  else:
    pilih batch dengan remaining_qty > 0 di lokasi tsb
    urut by produced_at ASC, lalu created_at ASC
    pecah qty ke beberapa batch jika perlu
  for each (batch, take):
    update batch.remaining_qty -= take
    insert stock_movements(batch, product, location, type, take, …)
```

> Implementasi via **PostgreSQL function (`security invoker`)**
> sehingga RLS tetap berlaku, dan transaksi atomik.

## 3. Transfer Antar Lokasi

### One-way

1. Kasir pengirim membuat `transfers (mode = one_way)` + `transfer_items` (pilih batch sumber).
2. Sistem langsung:
   - kurangi `remaining_qty` batch sumber, catat `transfer_out`.
   - buat batch baru di lokasi tujuan (mewarisi `produced_at` & `expires_at`).
   - catat `transfer_in`.
   - `transfers.status = received`.

### Two-way

1. Pengirim membuat transfer (`status = pending`).
2. Saat dikirim secara fisik → tandai `in_transit` (opsional, untuk tracking).
3. Penerima membuka inbox, **konfirmasi** → status `received`, batch tujuan dibuat
   (alur sama dengan one-way step 2).
4. Penerima boleh **menolak** → status `rejected`, batch sumber tidak terpotong.
5. Pengirim boleh **batalkan** sebelum diterima → status `cancelled`.

### Penerimaan Parsial (Partial Receive)

- Penerima dapat mengirimkan `p_items` saat konfirmasi dengan format:
  `[{ item_id, received_qty, loss_reason? }, ...]`
- `received_qty` = qty fisik yang diterima (0 ≤ received_qty ≤ quantity)
- Selisih (`quantity - received_qty`) dicatat sebagai `transfer_loss` di lokasi **asal**
  (akuntabilitas pengirim). Tidak mengubah `remaining_qty` batch karena sudah
  di-deduct saat `create_transfer`.
- Jika `p_items` tidak dikirim, semua item diterima utuh (perilaku lama).

### Edit Transfer Saat Pending

- Pengirim (atau super admin) dapat mengedit qty/item transfer selama status `pending`.
- `fn_update_transfer_items` menggunakan strategi "rebuild":
  1. Kembalikan semua qty lama ke batch sumber.
  2. Hapus stock_movements `transfer_out` lama dan transfer_items.
  3. Insert ulang sesuai p_items baru, deduct stok lagi.
- Item baru boleh ditambah, item lama boleh dihapus.
- Performa cukup karena items per transfer biasanya kecil (<20).

### Format Kode Transfer

- Format: `TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD`
- Contoh: `TR-PRO-CLD-1-2026-05-22`
- Counter N per pasangan asal+tujuan per hari (Asia/Jakarta), monotonik
- Transfer yang dibatalkan tetap menempati nomornya (tidak digeser)
- Anti race-condition via `pg_advisory_xact_lock`

### Transfer Loss di Inventory Matrix

- Kolom baru `transfer_loss` di composite type `inventory_matrix_row`
- Transfer loss mengurangi stok di lokasi asal:
  ```
  closing = opening + produced_in + entered_in + transfer_in + adjustment_in
           - transfer_out - transfer_loss - sold - expired_out - damage_out
           - compliment_out - tester_out - adjustment_out
  ```

> Aturan RLS: kasir hanya boleh **insert** transfer ketika `from_location_id =
current_outlet_id()`, dan **update** ketika dia pengirim atau penerima.

## 4. Logika Perishable & Notifikasi Expired

Untuk produk dengan `is_perishable = true`:

- UI menyalakan **warning** ketika
  `expires_at - now() <= product.expiry_warning_hours`.
- Saran diskon ditampilkan = `product.expiry_discount_percent`.
- Aplikasi tetap memungkinkan penjualan; warning **terus muncul** sampai kasir
  melakukan tindakan: penjualan, `damage_out`, atau `expired_out`.

Untuk `is_perishable = false`:

- `expires_at` selalu NULL (di-NULL-kan oleh trigger).
- Tidak ada warning, tidak ada saran diskon.

## 5. Penjualan

- 1 transaksi `sales` boleh berisi banyak `sale_items` (multi-varian).
- Tidak ada harga, metode bayar, atau pajak — sistem fokus stok.
- Model cart menggunakan `splits[]` per item (menggantikan single `override_batch_id`).
  Tiap split = `{ batch_id: string | null, quantity: number }`.
- Mode "Otomatis (FIFO)": batch dipilih otomatis, UI menampilkan preview distribusi.
- Mode "Pilih batch manual": kasir input qty per batch, total harus cocok.
- Server mengirim tiap split sebagai `sale_item` terpisah ke `fn_record_sale`.

### Void Sale (Pembatalan Transaksi)

- **Soft delete**: kolom `voided_at`, `voided_by`, `void_reason` di tabel `sales`.
- Sale tetap di DB untuk jejak audit, hanya dikecualikan dari laporan.
- **Reversal stok**: untuk setiap movement `sale_out` asli, dibuat movement baru
  bertipe `sale_void` yang mengembalikan `remaining_qty` batch.
- **Idempotent**: `fn_void_sale` tidak melakukan apa-apa kalau sale sudah void.
- **Permission**:
  - Super admin: void kapan saja, di outlet mana pun.
  - Kasir: hanya void transaksi miliknya sendiri di outletnya pada hari yang sama.
- **Dampak ke laporan**:
  - `fn_eod_report`: sold = `sale_out - sale_void` (per produk).
  - `fn_inventory_matrix`: sold = `sale_out - sale_void` (NET). `sale_void` dianggap
    IN saat menghitung opening.
- Ekspos via `voidSaleAction` di client → tombol baru di riwayat penjualan (sale history panel).

## 6. End-of-Day (EOD) Report

Dijalankan kasir pada akhir shift untuk outletnya sendiri (tanggal aktif).

Format text yang dibagikan via `wa.me/?text=<encoded>`:

```
📊 EOD <Outlet> — <DD MMM YYYY>

Terjual
<Produk A>: <qty> <unit>
<Produk B>: <qty> <unit>
…

Disposal
❌ <Produk>: <qty> <unit> (Expired)
🎁 <Produk>: <qty> <unit> (Compliment)
🧪 <Produk>: <qty> <unit> (Tester)
🗑️ <Produk>: <qty> <unit> (Rusak)

Stock Update
<Produk A>: <total sisa> <unit>
  <DD MMM>: <qty per batch>
  <DD MMM>: <qty per batch>
<Produk B>: <total sisa> <unit>
  <DD MMM>: <qty per batch>
```

- Penjualan sudah termasuk void reversal (sold = sale_out - sale_void).
- "Tanggal" pada Stock Update = `produced_at` (atau entry date) dari batch.
- Batch perishable yang sudah habis tidak ditampilkan.
- Tombol "Bagikan ke WhatsApp" membuka URL skema `https://wa.me/?text=…`
  → user pilih kontak/grup tujuan.

## 7. Inventory Matrix

Per tanggal & per produk, kolom:

| Kolom         | Sumber                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Stok Awal     | Snapshot `remaining_qty` per batch ≤ 00:00 tanggal terpilih (termasuk sale_void sebagai IN)                      |
| Masuk         | `SUM(qty)` movement `production_in + entry_in` di tanggal itu                                                    |
| Transfer In   | `SUM(qty)` movement `transfer_in`                                                                                |
| Transfer Out  | `SUM(qty)` movement `transfer_out`                                                                               |
| Transfer Loss | `SUM(qty)` movement `transfer_loss`                                                                              |
| Terjual       | `SUM(qty)` movement `sale_out - sale_void` (NET)                                                                 |
| Expired       | `SUM(qty)` movement `expired_out`                                                                                |
| Compliment    | `SUM(qty)` movement `compliment_out`                                                                             |
| Tester        | `SUM(qty)` movement `tester_out`                                                                                 |
| Rusak         | `SUM(qty)` movement `damage_out`                                                                                 |
| Stok Akhir    | Stok Awal + Masuk + Transfer In − Transfer Out − Transfer Loss − Terjual − Expired − Compliment − Tester − Rusak |

Filter outlet (single / all) disimpan di `localStorage` dengan key
`inventory-matrix:filters` agar persisten antar reload.

---

## Lampiran A — Master Data (Iterasi 1)

### Outlet

- **Kode** unik (case-sensitive, A–Z, 0–9, `-`, `_`, 2-20 char). Constraint
  unik di DB, error friendly ditampilkan ke form.
- **Tipe**: `central_kitchen` (sumber produksi) atau `outlet` (cabang). Hanya
  tipe ini yang valid di seluruh aplikasi.
- **Nonaktifkan** memakai flag `is_active=false`. Tidak menghapus baris agar
  histori movement & sale tetap terbaca.

### Produk (varian)

- **SKU** unik (A–Z, 0–9, `-`, `_`, 2-40 char).
- **Perishable** ⇒ wajib `default_shelf_life_hours > 0`. Saat batch dibuat,
  trigger `tg_batch_set_expiry` mengisi `expires_at` otomatis bila tidak
  ditentukan; nilai per-batch boleh override.
- **Threshold warning** (`expiry_warning_hours`): default 24 jam. UI Kasir
  pada iterasi berikutnya akan memunculkan warning persisten saat
  `expires_at - now() ≤ threshold`.
- **Saran diskon** (`expiry_discount_percent`): nilai 0-100 untuk informasi
  saja. PRD ini tidak mencatat harga.
- **Non-perishable** mengabaikan ketiga field di atas; trigger meng-NULL-kan
  `expires_at` agar tidak ada false positive.

### Pengguna & Peran

- Akun Supabase dibuat oleh Super Admin lewat halaman **Pengguna**, bukan
  self-signup. Implementasi memakai `supabase.auth.admin.createUser` (service
  role) lalu insert ke `public.profiles` dengan id yang sama.
- **Kasir** wajib `outlet_id`. Validasi diterapkan di Zod (server action) dan
  di constraint DB `profile_cashier_needs_outlet`.
- **Reset password** memakai `auth.admin.updateUserById` — pengguna dapat login
  ulang dengan password baru tanpa perlu email reset link (cocok untuk skenario
  manajer hand-over kredensial ke kasir baru).
- **Nonaktifkan** kasir cukup set `is_active=false` di profil. Sesi yang
  sedang berjalan akan tertahan di RLS karena policy mengevaluasi profil
  saat ini; untuk memutus paksa, hapus session lewat Studio jika perlu.

---

## Lampiran B — Produksi & Stok (Iterasi 2)

### Halaman Produksi (`/produksi`)

Hanya Super Admin. Dibagi menjadi dua tabs:

1. **Catat produksi (perishable)** — wajib lokasi `central_kitchen`. UI
   meng-auto-isi `expires_at` dari `produced_at + product.default_shelf_life_hours`.
   Selama user belum mengubah field itu manual, perubahan produk atau jam
   produksi akan menghitung ulang. Setelah user edit, nilai dikunci sampai
   form di-reset.
2. **Stok masuk (non-perishable)** — lokasi bebas, default Central Pastry.
   Tidak ada kedaluwarsa.

Kedua form memanggil RPC ke `fn_record_production` / `fn_record_stock_entry`
agar logika kedaluwarsa dan validasi lokasi dipusatkan di DB.

### Riwayat Produksi (`production-history.tsx`)

Komponen tambahan di halaman `/produksi` yang menampilkan tabel batch
yang diproduksi pada tanggal terpilih:

- **Date navigator** (◀/▶/Today) untuk memilih tanggal
- **Filter lokasi** Central Pastry, persisted di `localStorage`
- **Kolom tabel:** Waktu, Produk, Lokasi, Qty, Kedaluwarsa, Aktor, Catatan

### Halaman Stok (`/stok`)

Tersedia untuk semua peran. Sumber data: view `v_stock_per_location`.

- **Filter Lokasi** — single outlet atau "Semua lokasi". Default kasir =
  outlet sendiri; admin = "Semua". Filter disimpan di
  `localStorage` key `stock-board:filters`.
- **Realtime** — channel `postgres_changes` ke `stock_batches` dan
  `stock_movements` memicu re-fetch view (debounce sederhana via stale-state).
- **Warning expired** — baris ditandai oranye + ikon AlertTriangle ketika
  `nearest_expiry - now() ≤ product.expiry_warning_hours`. Saran diskon
  ditampilkan sebagai badge.
- **Detail batch** — tombol "Detail batch" membuka modal berisi semua batch
  aktif (`remaining_qty > 0`) untuk produk+lokasi tsb, urut FIFO. Cocok untuk
  troubleshooting dan kelak untuk pilihan override batch saat penjualan.

### FIFO + manual override

Implementasi pemotongan stok dipusatkan di `fn_deduct_stock_fifo`. Halaman
penjualan & adjustment di iterasi berikutnya tinggal panggil RPC ini:

- Tanpa override: lewatkan `p_batch_id = NULL` → FIFO + boleh pecah ke
  beberapa batch.
- Dengan override: lewatkan `p_batch_id = <uuid>` → ambil dari satu batch saja
  (qty harus muat).

Function mengembalikan `(batch_id, quantity_taken, movement_id)` untuk tiap
pemotongan, sehingga UI bisa menampilkan rincian "diambil dari batch X
sebanyak Y" tanpa query tambahan.

---

## Lampiran C — Transfer (Iterasi 3)

### Halaman & alur

| Route            | Akses                                   | Fungsi                                                                                            |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/transfer`      | semua                                   | Daftar transfer dengan filter status & outlet (tersimpan di localStorage `transfer-list:filters`) |
| `/transfer/baru` | semua (kasir terbatas asal = outletnya) | Form multi-item, pilih batch sumber + qty, mode one-way/two-way                                   |
| `/transfer/[id]` | semua                                   | Detail + tombol aksi (Ship / Confirm / Reject / Cancel / Edit items) sesuai peran                 |

### Pengirim vs Penerima

- **Kasir** boleh:
  - Membuat transfer dari `outlet_id`-nya (asal kasir).
  - Membatalkan transfer yang dia buat (sebelum diterima).
  - Konfirmasi / menolak transfer masuk ke `outlet_id`-nya.
  - **Edit item** transfer yang dia buat selama status `pending`.
- **Super Admin** boleh semua di atas tanpa batasan outlet.

### Status & transisi

```
                ┌───────────┐
                │ pending   │  (two_way default)
                └─────┬─────┘
   fn_ship_transfer   │   fn_cancel_transfer       ┌────────────┐
                     ▼                            │ cancelled  │
                ┌──────────┐ ──── cancel ─────▶   └────────────┘
                │in_transit│
                └─────┬────┘ ──── reject  ─────▶   ┌────────────┐
   fn_confirm_transfer│                           │  rejected  │
                     ▼                            └────────────┘
                ┌──────────┐
                │ received │  (one_way → langsung kemari)
                └──────────┘
```

### Transfer items: Edit saat pending

Pengirim atau super admin dapat mengedit item transfer selama status `pending`:

- Menambah/menghapus item
- Mengubah kuantitas item
- Stok di-rebuild: semua qty lama dikembalikan ke batch sumber, lalu deduct
  ulang sesuai p_items baru.
- Tombol "Edit item" muncul di halaman detail transfer.

### Penerimaan parsial

Penerima dapat mengirimkan `received_qty` per item saat konfirmasi:

- Selisih otomatis tercatat sebagai `transfer_loss` di lokasi asal
- Tidak perlu disposal manual lagi untuk susut transit (croissant 50 → 47)

### Stok & batch

- Saat transfer dibuat, stok dipotong dari batch sumber (`transfer_out`).
- Mode **one-way**: batch tujuan dibuat seketika — pewarisan `produced_at`
  dan `expires_at` (perishable) memastikan FIFO outlet penerima konsisten.
- Mode **two-way**: batch tujuan baru dibuat saat `fn_confirm_transfer`
  dipanggil oleh penerima. Batch partial receive hanya dibuat sejumlah `received_qty`.
- Cancel/Reject: stok dikembalikan ke batch sumber + dicatat sebagai
  `adjustment_in` (audit trail terlihat dari halaman Stok detail batch).

### UI signal di Dashboard

Untuk kasir, banner oranye muncul di dashboard ketika ada transfer ke
`outlet_id`-nya yang masih `pending` atau `in_transit`. Klik banner langsung
memfilter daftar transfer ke status pending + outlet kasir.

---

## Lampiran D — Penjualan, Disposal & EOD (Iterasi 4)

### Halaman Penjualan (`/penjualan`) — POS Redesign

UI diubah total dari form-based menjadi POS-style layout:

**Layout:**

- Dua kolom: product grid (kiri) + sticky cart (kanan)
- Product card dengan tap-to-add, qty badge, category badge, expiry warning
- Search bar + filter tabs (Semua / Perishable / Non-perishable / Hampir expired)
- Category filter chips (AND logic dengan tabs di atas)

**Cart:**

- Stepper (+/−) per item, batch picker modal, notes field
- Multi-batch split per item (lihat §5 di atas)
- Mobile: floating cart bar + bottom sheet

**Keyboard shortcuts:** `/` focus search, `Ctrl+Enter` submit

**Realtime:** stok di-update setelah sale + manual refetch fallback

**Riwayat:** dipindah ke Sheet dengan date filter (◀/▶/Today) + void button

**Void Sale:** tombol untuk membatalkan transaksi (soft delete + reversal stok),
muncul di sale history panel.

**Validasi:** total qty per produk ≤ total `remaining_qty` di outlet.
Server tetap memvalidasi via `fn_record_sale` + `fn_deduct_stock_fifo`.

### Disposal (modal di `/stok`)

Tombol "Buang" per baris stok membuka modal yang memanggil
`fn_record_disposal`:

- **Expired** — hanya muncul untuk produk perishable.
- **Compliment** — diberikan sebagai hadiah/sample ke pelanggan.
- **Tester** — dijadikan tester/sample untuk promosi.
- **Rusak / waste** — produk apa saja.

> **Catatan:** Adjustment tidak ditampilkan di UI disposal (hanya dipakai
> internal oleh sistem untuk pembatalan transfer).

Default batch = FIFO. Pilih batch spesifik untuk membuang dari produksi
tertentu (mis. saat opname menemukan lot kontaminasi).

### EOD Report (`/eod`)

- Filter: outlet + tanggal. Tanggal disimpan di `localStorage` key
  `eod-panel:date` agar kasir tidak perlu pilih ulang setiap buka halaman.
- Pratinjau menggunakan format mengikuti PRD.
- Data penjualan sudah termasuk void reversal (sold = sale_out - sale_void).
- Tombol **Bagikan ke WhatsApp** membuka `https://wa.me/?text=<encoded>`
  pada tab baru — kasir memilih kontak/grup tujuan secara manual.
- Tombol **Salin teks** sebagai cadangan jika perangkat memblokir scheme `wa.me`.

### Hak akses ringkas (Iterasi 4)

| Aksi            | Kasir                               | Super Admin  |
| --------------- | ----------------------------------- | ------------ |
| Catat penjualan | hanya outlet sendiri                | semua outlet |
| Void sale       | hanya transaksi sendiri, hari sama  | semua outlet |
| Buang stok      | hanya outletnya                     | semua outlet |
| EOD report      | hanya outletnya (default ter-pilih) | semua outlet |

---

## Lampiran E — Inventory Matrix (Iterasi 5)

### Halaman `/matrix`

Satu tabel per tanggal × lokasi. Kolom (kiri ke kanan):

| Kolom         | Sumber                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Stok Awal     | Net movement sebelum 00:00 tanggal terpilih (sale_void dianggap IN)                                              |
| Masuk         | `production_in + entry_in + adjustment_in`                                                                       |
| Transfer In   | `transfer_in`                                                                                                    |
| Transfer Out  | `transfer_out`                                                                                                   |
| Transfer Loss | `transfer_loss`                                                                                                  |
| Terjual       | `sale_out - sale_void` (NET)                                                                                     |
| Expired       | `expired_out`                                                                                                    |
| Compliment    | `compliment_out`                                                                                                 |
| Tester        | `tester_out`                                                                                                     |
| Rusak         | `damage_out`                                                                                                     |
| Stok Akhir    | Stok Awal + Masuk + Transfer In − Transfer Out − Transfer Loss − Terjual − Expired − Compliment − Tester − Rusak |

Catatan: kolom **Masuk** menggabungkan beberapa movement type. Modal
drilldown menampilkan breakdown per komponen.

### Filter & state

- **Tanggal** — input native `<input type="date">` plus tombol ◀/▶/Hari
  ini. Tidak di-persist (default selalu hari ini saat halaman dibuka).
- **Lokasi** — dropdown "Semua / outlet" di-persist di `localStorage` key
  `inventory-matrix:filters`. Default kasir = outletnya, default admin =
  "Semua".

### Interaksi tabel

- Sel angka adalah tombol — klik membuka modal drilldown.
- Sel bernilai 0 ditampilkan sebagai `—` (tidak interaktif) agar fokus visual ke aktivitas nyata.
- Stok awal tidak punya drilldown.
- Stok akhir ditebalkan untuk menonjolkan hasil agregasi.

### Hak akses

Function `fn_inventory_matrix` & `fn_inventory_matrix_cell` adalah
`security invoker`. RLS pada `stock_movements`, `stock_batches`,
`products`, `locations` membatasi data otomatis sesuai peran.

Export (CSV/Excel/PDF) ditunda sesuai keputusan PRD.

---

## Lampiran G — Kategori Produk (Iterasi 7)

### Tabel `product_categories`

Master kategori produk (id, code, name, icon, color, sort, is_active).
Produk memiliki nullable `category_id` FK ke tabel ini.

### Halaman `/master/categories` (Super Admin only)

CRUD kategori dengan field: kode, nama, icon, warna, urutan.
Menu sidebar: Master Data → Kategori (antara Outlet dan Produk).

### Integrasi ke halaman lain

- **Form produk:** dropdown Category
- **List produk:** badge kategori berwarna
- **POS (`/penjualan`):** category filter chips (AND dengan tabs existing)
- **Stok (`/stok`):** category filter chips + kolom Kategori di tabel
- **View `v_stock_per_location`:** extended dengan kolom `category_code`
  dan `category_name` via join ke `product_categories`

### RLS

- Read: semua authenticated user
- Write (insert/update/delete): hanya `super_admin`

---

## Lampiran F — Polishing (Iterasi 6)

### Toast system

`<ToastProvider>` di root layout menyediakan `useToast()` di seluruh app:

```tsx
const toast = useToast();
toast.success("Tersimpan", "Optional description");
toast.error("Gagal", "Coba lagi nanti");
toast.warning("Stok hampir habis");
toast.info("Sinkronisasi…");
```

Auto-dismiss default 4 detik (6 detik untuk error). Render via portal di
`document.body`, posisi bottom-right di desktop, bottom-center di mobile.

### Banner expired di Dashboard

Server component menjalankan satu query:

- Kasir → batch perishable di outletnya yang `expires_at` masih ≥ now.
- Admin → semua outlet, sama.

Lalu di-filter per produk pakai `expiry_warning_hours`-nya. Jumlah batch
yang masuk threshold ditampilkan sebagai banner oranye dengan link ke `/stok`.

### Transfer inbox di Dashboard

Banner oranye untuk transfer pending/in_transit masuk ke outlet kasir.
Klik banner langsung memfilter daftar transfer ke status pending + outlet kasir.

### Halaman Aktivitas

Tampilkan 200 movement terbaru sebagai audit trail. Tidak butuh tabel
audit terpisah karena `stock_movements` sudah punya:

- `movement_type`, `quantity`, `occurred_at`
- `reference_type` + `reference_id` (kaitan ke sale / transfer / batch)
- `notes` (catatan kasir / sistem)
- `created_by` → nama aktor via join ke `profiles`

Filter via search params: `?type=<movement_type>` dan `?outlet=<location_id>`.

### Error boundaries & loading states

| File                        | Tujuan                                  |
| --------------------------- | --------------------------------------- |
| `src/app/error.tsx`         | Tangkap error global di root            |
| `src/app/(app)/loading.tsx` | Suspense fallback untuk navigasi privat |
| `src/app/not-found.tsx`     | 404 page custom                         |

### Security headers

Diterapkan di `next.config.ts` untuk semua route:

| Header                      | Nilai                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                                      |
| `X-Frame-Options`           | `DENY`                                                         |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                              |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                 |

> Tidak ada Content-Security-Policy default karena Next.js + Supabase
> memerlukan inline scripts untuk hydration. Jika ingin CSP ketat, gunakan
> `nonce` lewat `proxy.ts` (lihat docs Next 16 — pola `nonce` + `Set-Cookie`).

---

## Lampiran H — Void Sale & Transfer Enhancements (Iterasi 8)

### Void Sale

- **Fitur**: Membatalkan transaksi penjualan yang sudah tercatat.
- **Soft delete**: Sale tetap di DB dengan `voided_at` → 0 dampak ke laporan.
- **Reversal**: Stok dikembalikan ke batch asal via movement `sale_void`.
- **Permission**: Super admin bebas; kasir hanya miliknya sendiri hari yang sama.
- **UI**: Tombol void di sale history panel (icon X atau "Batalkan").
- **Idempotent**: Void dua kali tidak berefek.

### Transfer Partial Receive

- **Fitur**: Penerima dapat mengkonfirmasi dengan qty yang berbeda dari kiriman.
- **Use case**: Sopir bawa 50 croissant, sampai hanya 47 (3 hancur di motor).
- **Transfer loss**: Selisih dicatat di lokasi asal — akuntabilitas pengirim.
- **UI**: Input `received_qty` per item di modal konfirmasi + field `loss_reason`.

### Edit Transfer Items

- **Fitur**: Pengirim dapat mengedit item transfer selama status `pending`.
- **Rebuild strategy**: Kembalikan stok lama → hapus items → insert ulang.
- **UI**: Tombol "Edit item" di halaman detail transfer saat `pending`.

### Transfer Code Format

- **Fitur**: Format kode baru `TR-[ASAL]-[TUJUAN]-[N]-TANGGAL`.
- **Contoh**: `TR-PRO-CLD-1-2026-05-22`.
- **Counter monotonik per pasangan+tgl**, anti race dengan advisory lock.
- **Cancel tidak menggeser counter** — transfer dibatalkan tetap punya nomor.
