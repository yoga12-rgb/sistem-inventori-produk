# Roadmap

Iterasi disusun agar tiap rilis dapat dipakai end-to-end.

## ✅ Iterasi 0 — Skeleton

- Init Next.js 16 (App Router, TypeScript, Tailwind v4)
- Supabase CLI + migration awal (skema, RLS, realtime)
- Auth: login email/password, proxy.ts guard
- Theme: dark/light, accent oranye
- Dokumen `PRD.md` + `docs/`

## ✅ Iterasi 1 — Master Data (Super Admin)

- App shell: sidebar nav + header + sign-out, role-aware menu
- UI primitives: Button, Input, Label, Textarea, Select, Switch, Badge, Card,
  Table, Modal, FormField (shadcn-style, ringan, tablet-friendly)
- CRUD `locations` (Central Pastry + outlet) — list, create/edit, toggle active
- CRUD `products` — perishable flag, default shelf life, threshold warning,
  saran diskon (semua bisa di-override per batch nanti)
- CRUD `profiles` + Supabase Auth — Super Admin bisa membuat akun kasir/admin,
  assign outlet, reset password (lewat service-role admin client di server)
- Dashboard menampilkan jumlah outlet/produk/pengguna aktif

## ✅ Iterasi 2 — Stok & Produksi

- Postgres functions: `fn_record_production`, `fn_record_stock_entry`,
  `fn_deduct_stock_fifo` (FIFO + manual override per batch)
- View agregat `v_stock_per_location` untuk halaman Stok
- Halaman **Produksi** (Super Admin): catat batch perishable di Central
  Kitchen + auto-isi `expires_at` dari shelf life
- Halaman **Stok Masuk** (Super Admin): pemasukan non-perishable, lokasi bebas
- Halaman **Stok** (semua user, tablet-first): ringkasan per produk+lokasi,
  filter outlet persisten di localStorage, modal detail batch, warning expired
  - saran diskon, **realtime** (`stock_batches` + `stock_movements`)
- Dashboard menampilkan jumlah batch aktif

## ✅ Iterasi 3 — Transfer

- Postgres functions: `fn_create_transfer`, `fn_ship_transfer`,
  `fn_confirm_transfer`, `fn_cancel_transfer`, `fn_reject_transfer` +
  helper `_tx_restore_source` (semua atomik, `for update`)
- Halaman `/transfer` — list + filter status/outlet (persisten localStorage)
- Halaman `/transfer/baru` — multi-item, dropdown batch dengan info
  shelf life, validasi qty client-side, mode one-way / two-way
- Halaman `/transfer/[id]` — detail + tombol Ship / Confirm / Reject /
  Cancel sesuai peran (pengirim vs penerima vs admin)
- Banner inbox di Dashboard untuk kasir ketika ada transfer pending masuk
- Pewarisan `produced_at` & `expires_at` ke batch tujuan agar FIFO konsisten

## ✅ Iterasi 4 — Penjualan & EOD

- Postgres functions: `fn_record_sale` (multi-item, FIFO + manual override),
  `fn_record_disposal` (expired/damage/adjustment_out), `fn_eod_report`
  (agregat penjualan + stok akhir per batch untuk satu tanggal/outlet)
- Halaman `/penjualan` — form transaksi multi-item dengan dropdown override
  batch per item, validasi stok klien-side, warning produk perishable
  mendekati expired + saran diskon
- Halaman `/eod` — pratinjau pesan WhatsApp, tombol "Bagikan ke WhatsApp"
  membuka `wa.me/?text=…`, tombol "Salin teks" sebagai cadangan, filter
  outlet & tanggal (tanggal di-persist di localStorage)
- Tombol "Buang" pada halaman Stok membuka modal disposal — alasan
  (expired/damage/adjustment), batch otomatis FIFO atau pilih manual
- Riwayat 20 transaksi terakhir di halaman Penjualan
- Banner sukses setelah submit penjualan

## ✅ Iterasi 5 — Inventory Matrix

- Postgres function `fn_inventory_matrix(date, location?)` mengembalikan
  per (produk × lokasi): opening, produced_in, entered_in, transfer_in,
  transfer_out, sold, expired_out, damage_out, adjustment_in/out, closing
  — semua untuk satu tanggal Asia/Jakarta. Opening dihitung dari net
  movement sebelum tanggal target.
- Function `fn_inventory_matrix_cell(...)` untuk drilldown tiap sel ke
  movement individual (mendukung filter kind: in/out/sold/transfer*\*/
  expired/damage/adjustment*\*).
- Halaman `/matrix` dengan navigasi tanggal (◀/▶/Hari ini), filter outlet
  persisten di `localStorage`, kolom interaktif (klik angka → modal detail
  - ringkasan komponen + chip filter sub-kind).
- Export ditunda sesuai keputusan PRD.

## ✅ Iterasi 6 — Polishing & Deploy

- Toast system global (`<ToastProvider>` di root layout) + integrasi sukses
  penjualan
- Banner expired-soon di Dashboard untuk kasir (filter outlet sendiri) dan
  super admin (semua outlet)
- Halaman `/aktivitas` (super admin) — viewer 200 movement terbaru dengan
  filter tipe & lokasi, sumber dari `stock_movements`
- App shell: menu **Aktivitas** untuk super admin
- Production hardening:
  - `error.tsx` global error boundary
  - `not-found.tsx`
  - `(app)/loading.tsx` Suspense fallback
  - Security headers di `next.config.ts` (HSTS, X-Frame-Options,
    Referrer-Policy, Permissions-Policy, X-Content-Type-Options)
- `docs/deployment.md` — panduan deploy Vercel + Supabase Cloud
- Halaman privat sekarang punya error boundary granular: kalau Server
  Component throw (misal Supabase down), pengguna lihat halaman recovery
  bukan stack trace.

## ✅ Iterasi 7 — Disposal Categories, POS Redesign, Multi-Batch Split, Kategori Produk & Production History

### Disposal Categories

- Enum values baru: `compliment_out`, `tester_out` pada `stock_movement_type`
- `fn_record_disposal` menerima: expired_out, damage_out, compliment_out,
  tester_out, adjustment_out
- UI disposal dialog: Expired (perishable only), Compliment, Tester, Rusak.
  Adjustment dihapus dari UI (tetap di DB untuk pembatalan transfer)
- Inventory Matrix kolom berubah: Stok Awal → Masuk → Transfer In →
  Transfer Out → Terjual → Expired → Compliment → Tester → Rusak → Stok Akhir
- EOD report: section "Disposal" dengan emoji per kategori
  (❌ Expired, 🎁 Compliment, 🧪 Tester, 🗑️ Rusak)
- Halaman Aktivitas menampilkan label untuk movement type baru

### POS Redesign (`/penjualan`)

- Overhaul total dari form-based ke POS-style layout
- Dua kolom: product grid (kiri) + sticky cart (kanan)
- Product card: tap-to-add, qty badge, category badge, expiry warning
- Search bar + filter tabs (Semua/Perishable/Non-perishable/Hampir expired)
- Category filter chips (AND dengan tabs)
- Cart: stepper (+/−), batch picker modal, notes field
- Mobile: floating cart bar + bottom sheet
- Keyboard shortcuts: `/` focus search, `Ctrl+Enter` submit
- Realtime stock update setelah sale + manual refetch fallback
- Sale history dipindah ke Sheet dengan date filter (◀/▶/Today)

### Multi-Batch Split per Sale Item

- Cart model berubah dari single `override_batch_id` ke `splits[]`
- Tiap split = `{ batch_id: string | null, quantity: number }`
- Batch picker dialog: toggle "Otomatis (FIFO)" vs "Pilih batch manual"
- FIFO mode: preview batch mana yang akan dipotong
- Manual mode: input qty per batch, total harus cocok
- Server mengirim tiap split sebagai sale_item terpisah ke `fn_record_sale`

### Production History

- Komponen baru `production-history.tsx` di halaman `/produksi`
- Tabel batch yang diproduksi pada tanggal terpilih
- Date navigator (◀/▶/Today)
- Filter lokasi Central Pastry, persisted di localStorage
- Kolom: Waktu, Produk, Lokasi, Qty, Kedaluwarsa, Aktor, Catatan

### Kategori Produk

- Tabel baru `product_categories` (id, code, name, icon, color, sort,
  is_active)
- Produk memiliki nullable `category_id` FK
- Halaman CRUD `/master/categories` (Super Admin only)
- Sidebar menu: Master Data → Kategori (antara Outlet dan Produk)
- Form produk: dropdown Category
- List produk: badge kategori berwarna
- POS: category filter chips (AND dengan tabs)
- Stok: category filter chips + kolom Kategori di tabel
- View `v_stock_per_location` extended dengan kolom kategori
- RLS: read all authenticated, write super_admin only

### Bug Fixes

- Modal focus trap + auto-focus first input on open
- Form alignment (items-start instead of items-end)
- Toast infinite loop fix (stable context value)
- Hydration mismatch fix (useId instead of Math.random untuk row UIDs)
- Stock tidak update setelah sale (manual refetch setelah submit)
- EOD ✅ prefix pada variant names

## ✅ Iterasi 8 — Void Sale, Transfer Enhancements & Performance

### Void Sale (Pembatalan Transaksi)

- Enum `sale_void` pada `stock_movement_type`
- Kolom soft-delete di `sales`: `voided_at`, `voided_by`, `void_reason`
- RLS untuk UPDATE sales: kasir hanya void transaksi sendiri hari yang sama
- `fn_void_sale(p_sale_id, p_reason?)` — reversal stok, idempotent
- `fn_eod_report` & `fn_inventory_matrix`: sold = `sale_out - sale_void` (NET)
- Void button di sale history panel (sale history sheet)

### Transfer Partial Receive & Edit

- Enum `transfer_loss` untuk susut transit
- Kolom `received_qty` & `loss_reason` di `transfer_items` (constraint: 0 ≤ received ≤ qty)
- `fn_confirm_transfer(p_transfer_id, p_items?)` — partial receive via JSONB opsional
- `fn_update_transfer_items(p_transfer_id, p_items)` — edit item saat pending (rebuild)
- Inventory Matrix: kolom `transfer_loss` baru + update rumus closing

### Transfer Code Format

- Format baru: `TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD`
- Counter monotonik per pasangan asal+tujuan per hari
- `pg_advisory_xact_lock` untuk anti race-condition
- Cancel tidak menggeser counter

### Performance (EOD Indexes)

- Composite index `idx_movements_eod_lookup(location_id, movement_type, occurred_at desc)`
- Partial index `idx_movements_sale_out` untuk lookup penjualan
- Index `idx_sales_voided_at` untuk filter sales yang di-void

### RLS Longgar untuk Profiles

- Policy `profiles_read_all_auth`: semua authenticated user boleh SELECT profiles
- Menyelesaikan bug: kasir tidak bisa melihat nama rekan kerja di riwayat/aktivitas

### Bug Fixes

- Realtime: channel cleanup di useEffect (removeChannel on unmount)
- Transfer code format race condition di fixed dengan advisory lock
