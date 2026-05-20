# Roadmap

Iterasi disusun agar tiap rilis dapat dipakai end-to-end.

## âœ… Iterasi 0 â€” Skeleton

- Init Next.js 16 (App Router, TypeScript, Tailwind v4)
- Supabase CLI + migration awal (skema, RLS, realtime)
- Auth: login email/password, proxy.ts guard
- Theme: dark/light, accent oranye
- Dokumen `PRD.md` + `docs/`

## âœ… Iterasi 1 â€” Master Data (Super Admin)

- App shell: sidebar nav + header + sign-out, role-aware menu
- UI primitives: Button, Input, Label, Textarea, Select, Switch, Badge, Card,
  Table, Modal, FormField (shadcn-style, ringan, tablet-friendly)
- CRUD `locations` (Central Pastry + outlet) â€” list, create/edit, toggle active
- CRUD `products` â€” perishable flag, default shelf life, threshold warning,
  saran diskon (semua bisa di-override per batch nanti)
- CRUD `profiles` + Supabase Auth â€” Super Admin bisa membuat akun kasir/admin,
  assign outlet, reset password (lewat service-role admin client di server)
- Dashboard menampilkan jumlah outlet/produk/pengguna aktif

## âœ… Iterasi 2 â€” Stok & Produksi

- Postgres functions: `fn_record_production`, `fn_record_stock_entry`,
  `fn_deduct_stock_fifo` (FIFO + manual override per batch)
- View agregat `v_stock_per_location` untuk halaman Stok
- Halaman **Produksi** (Super Admin): catat batch perishable di Central
  Kitchen + auto-isi `expires_at` dari shelf life
- Halaman **Stok Masuk** (Super Admin): pemasukan non-perishable, lokasi bebas
- Halaman **Stok** (semua user, tablet-first): ringkasan per produk+lokasi,
  filter outlet persisten di localStorage, modal detail batch, warning expired
  + saran diskon, **realtime** (`stock_batches` + `stock_movements`)
- Dashboard menampilkan jumlah batch aktif

## âœ… Iterasi 3 â€” Transfer

- Postgres functions: `fn_create_transfer`, `fn_ship_transfer`,
  `fn_confirm_transfer`, `fn_cancel_transfer`, `fn_reject_transfer` +
  helper `_tx_restore_source` (semua atomik, `for update`)
- Halaman `/transfer` â€” list + filter status/outlet (persisten localStorage)
- Halaman `/transfer/baru` â€” multi-item, dropdown batch dengan info
  shelf life, validasi qty client-side, mode one-way / two-way
- Halaman `/transfer/[id]` â€” detail + tombol Ship / Confirm / Reject /
  Cancel sesuai peran (pengirim vs penerima vs admin)
- Banner inbox di Dashboard untuk kasir ketika ada transfer pending masuk
- Pewarisan `produced_at` & `expires_at` ke batch tujuan agar FIFO konsisten

## âœ… Iterasi 4 â€” Penjualan & EOD

- Postgres functions: `fn_record_sale` (multi-item, FIFO + manual override),
  `fn_record_disposal` (expired/damage/adjustment_out), `fn_eod_report`
  (agregat penjualan + stok akhir per batch untuk satu tanggal/outlet)
- Halaman `/penjualan` â€” form transaksi multi-item dengan dropdown override
  batch per item, validasi stok klien-side, warning produk perishable
  mendekati expired + saran diskon
- Halaman `/eod` â€” pratinjau pesan WhatsApp, tombol "Bagikan ke WhatsApp"
  membuka `wa.me/?text=â€¦`, tombol "Salin teks" sebagai cadangan, filter
  outlet & tanggal (tanggal di-persist di localStorage)
- Tombol "Buang" pada halaman Stok membuka modal disposal â€” alasan
  (expired/damage/adjustment), batch otomatis FIFO atau pilih manual
- Riwayat 20 transaksi terakhir di halaman Penjualan
- Banner sukses setelah submit penjualan

## âœ… Iterasi 5 â€” Inventory Matrix

- Postgres function `fn_inventory_matrix(date, location?)` mengembalikan
  per (produk Ã— lokasi): opening, produced_in, entered_in, transfer_in,
  transfer_out, sold, expired_out, damage_out, adjustment_in/out, closing
  â€” semua untuk satu tanggal Asia/Jakarta. Opening dihitung dari net
  movement sebelum tanggal target.
- Function `fn_inventory_matrix_cell(...)` untuk drilldown tiap sel ke
  movement individual (mendukung filter kind: in/out/sold/transfer_*/
  expired/damage/adjustment_*).
- Halaman `/matrix` dengan navigasi tanggal (â—€/â–¶/Hari ini), filter outlet
  persisten di `localStorage`, kolom interaktif (klik angka â†’ modal detail
  + ringkasan komponen + chip filter sub-kind).
- Export ditunda sesuai keputusan PRD.

## âœ… Iterasi 6 â€” Polishing & Deploy

- Toast system global (`<ToastProvider>` di root layout) + integrasi sukses
  penjualan
- Banner expired-soon di Dashboard untuk kasir (filter outlet sendiri) dan
  super admin (semua outlet)
- Halaman `/aktivitas` (super admin) â€” viewer 200 movement terbaru dengan
  filter tipe & lokasi, sumber dari `stock_movements`
- App shell: menu **Aktivitas** untuk super admin
- Production hardening:
  - `error.tsx` global error boundary
  - `not-found.tsx`
  - `(app)/loading.tsx` Suspense fallback
  - Security headers di `next.config.ts` (HSTS, X-Frame-Options,
    Referrer-Policy, Permissions-Policy, X-Content-Type-Options)
- `docs/deployment.md` â€” panduan deploy Vercel + Supabase Cloud
- Halaman privat sekarang punya error boundary granular: kalau Server
  Component throw (misal Supabase down), pengguna lihat halaman recovery
  bukan stack trace.

## âœ… Iterasi 7 â€” Disposal Categories, POS Redesign, Multi-Batch Split, Kategori Produk & Production History

### Disposal Categories
- Enum values baru: `compliment_out`, `tester_out` pada `stock_movement_type`
- `fn_record_disposal` menerima: expired_out, damage_out, compliment_out,
  tester_out, adjustment_out
- UI disposal dialog: Expired (perishable only), Compliment, Tester, Rusak.
  Adjustment dihapus dari UI (tetap di DB untuk pembatalan transfer)
- Inventory Matrix kolom berubah: Stok Awal â†’ Masuk â†’ Transfer In â†’
  Transfer Out â†’ Terjual â†’ Expired â†’ Compliment â†’ Tester â†’ Rusak â†’ Stok Akhir
- EOD report: section "Disposal" dengan emoji per kategori
  (âŒ Expired, ðŸŽ Compliment, ðŸ§ª Tester, ðŸ—‘ï¸ Rusak)
- Halaman Aktivitas menampilkan label untuk movement type baru

### POS Redesign (`/penjualan`)
- Overhaul total dari form-based ke POS-style layout
- Dua kolom: product grid (kiri) + sticky cart (kanan)
- Product card: tap-to-add, qty badge, category badge, expiry warning
- Search bar + filter tabs (Semua/Perishable/Non-perishable/Hampir expired)
- Category filter chips (AND dengan tabs)
- Cart: stepper (+/âˆ’), batch picker modal, notes field
- Mobile: floating cart bar + bottom sheet
- Keyboard shortcuts: `/` focus search, `Ctrl+Enter` submit
- Realtime stock update setelah sale + manual refetch fallback
- Sale history dipindah ke Sheet dengan date filter (â—€/â–¶/Today)

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
- Date navigator (â—€/â–¶/Today)
- Filter lokasi Central Pastry, persisted di localStorage
- Kolom: Waktu, Produk, Lokasi, Qty, Kedaluwarsa, Aktor, Catatan

### Kategori Produk
- Tabel baru `product_categories` (id, code, name, icon, color, sort,
  is_active)
- Produk memiliki nullable `category_id` FK
- Halaman CRUD `/master/categories` (Super Admin only)
- Sidebar menu: Master Data â†’ Kategori (antara Outlet dan Produk)
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
- EOD âœ… prefix pada variant names