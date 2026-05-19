# Database

Sumber kebenaran skema ada di `supabase/migrations/`. Dokumen ini hanya peta tingkat tinggi.

> âš ï¸  **JANGAN** edit skema lewat dashboard Supabase cloud. Semua perubahan
> melalui `npx supabase migration new <nama>` lalu commit.

## Diagram entitas

```
locations â”€â”€â”¬â”€â”€ profiles (cashier.outlet_id)
            â”‚
            â”œâ”€â”€ stock_batches â”€â”€ stock_movements
            â”‚
            â”œâ”€â”€ sales â”€â”€ sale_items
            â”‚
            â””â”€â”€ transfers â”€â”€ transfer_items
```

## Tabel utama

### `locations`
Master Central Pastry + outlet. Field penting:
- `type`: `central_kitchen | outlet`.
- `is_active`: soft delete.

### `profiles`
Extends `auth.users`. Field penting:
- `role`: `super_admin | cashier`.
- `outlet_id`: WAJIB untuk `cashier`, opsional untuk admin.

### `products`
Tiap **varian = satu baris** dengan SKU sendiri.
- `is_perishable`: false â‡’ semua logika expired di-bypass.
- `default_shelf_life_hours`: dipakai trigger `tg_batch_set_expiry` untuk
  mengisi `expires_at` otomatis bila tidak diisi manual.
- `expiry_warning_hours`: jam sebelum expired untuk menyalakan warning UI.
- `expiry_discount_percent`: saran diskon otomatis.

### `stock_batches`
Granularitas pelacakan stok. Setiap batch punya:
- `product_id`, `location_id`, `produced_at`, `expires_at`.
- `initial_qty` (tidak boleh berubah), `remaining_qty` (turun seiring movement).
- `source_batch_id`: terisi bila batch dibuat dari transfer (warisan FIFO).

### `stock_movements`
Audit trail seluruh perubahan stok. Tipe:

| `movement_type` | Arah | Pemicu |
|---|---|---|
| `production_in` | + | Produksi di Central Pastry |
| `entry_in` | + | Pemasukan stok non-perishable |
| `sale_out` | âˆ’ | Penjualan |
| `expired_out` | âˆ’ | Buang karena lewat expired |
| `damage_out` | âˆ’ | Rusak / waste |
| `adjustment_in` / `adjustment_out` | Â± | Penyesuaian manual |
| `transfer_out` / `transfer_in` | âˆ’ / + | Transfer antar lokasi |

### `sales` / `sale_items`
- 1 transaksi = 1 row `sales`, multi-item via `sale_items`.
- `sale_items.override_batch_id` â‰  NULL â‡’ kasir override FIFO.

### `transfers` / `transfer_items`
- `mode = one_way`: status loncat langsung ke `received`.
- `mode = two_way`: alur `pending â†’ in_transit â†’ received | rejected | cancelled`.
- `transfer_items.destination_batch_id` di-set saat batch baru dibuat di lokasi tujuan.
- Saat transfer diterima, batch tujuan **mewarisi** `produced_at` dan `expires_at` dari sumber.

## Indeks

| Index | Tujuan |
|---|---|
| `idx_products_sku` | Lookup cepat per SKU |
| `idx_batches_fifo` (partial: `remaining_qty > 0`) | FIFO scan per product+location |
| `idx_batches_expires_at` (partial: not null) | Notifikasi expired |
| `idx_movements_loc_date` | Inventory matrix per outlet/tanggal |
| `idx_sales_location_date` | EOD report |
| `idx_transfers_status` / `_from_loc` / `_to_loc` | Inbox transfer |

## Trigger

- `tg_set_updated_at` â€” update `updated_at` di seluruh tabel master.
- `tg_batch_set_expiry` â€” auto isi `expires_at` saat insert batch perishable;
  auto NULL untuk non-perishable.

## Helper RLS

Tiga function `security definer` membaca `profiles` user saat ini:

- `current_role()` â†’ `user_role`
- `current_outlet_id()` â†’ `uuid`
- `is_super_admin()` â†’ `boolean`

Dipakai dalam policy untuk mengizinkan kasir hanya menulis ke outlet sendiri.

## Realtime

Yang dipublikasi ke `supabase_realtime`:
`stock_batches`, `stock_movements`, `sales`, `sale_items`, `transfers`,
`transfer_items`. Ini menutupi seluruh perubahan yang tampil di Inventory Matrix
& Inbox Transfer.


---

## Migration `stock_functions` (Iterasi 2)

Menambahkan tiga function Postgres + satu view agregat. Semua function
`security invoker` agar RLS user yang memanggil tetap dievaluasi.

### `fn_record_production(p_product_id, p_location_id, p_quantity, p_produced_at?, p_expires_at?, p_notes?)`
- Validasi: `p_quantity > 0`, lokasi harus `central_kitchen`, produk wajib ada.
- Membuat baris `stock_batches` baru (trigger `tg_batch_set_expiry` mengisi
  `expires_at` otomatis bila NULL dan produk perishable).
- Mencatat `stock_movements` tipe `production_in` dengan
  `reference_type='production'`.
- Returns `uuid` batch baru.

### `fn_record_stock_entry(p_product_id, p_location_id, p_quantity, p_entered_at?, p_notes?)`
- Hanya untuk produk **non-perishable**. Untuk perishable gunakan
  `fn_record_production`.
- Lokasi bebas (default Central Pastry di UI). `expires_at` di-NULL-kan oleh
  trigger.
- Returns `uuid` batch baru, mencatat `stock_movements` tipe `entry_in`.

### `fn_deduct_stock_fifo(p_product_id, p_location_id, p_quantity, p_movement_type, p_batch_id?, p_reference_type?, p_reference_id?, p_occurred_at?, p_notes?)`
- Movement type harus salah satu: `sale_out`, `expired_out`, `damage_out`,
  `adjustment_out`, `transfer_out`. Movement IN ditolak.
- **Override manual** lewat `p_batch_id` â€” qty diambil dari satu batch saja.
- **FIFO otomatis** bila `p_batch_id NULL` â€” iterasi batch dengan
  `produced_at ASC, created_at ASC` (mengikuti index parsial
  `idx_batches_fifo`), pecah ke beberapa batch bila perlu.
- Pre-check total stok agar pesan error jelas (`Stok tidak cukup. Tersedia: x,
  diminta: y`) sebelum scan FIFO.
- Returns `setof stock_deduction_line(batch_id, quantity_taken, movement_id)`
  â€” caller dapat melihat distribusi pemotongan ke beberapa batch.

### View `v_stock_per_location`
Agregat `remaining_qty > 0` per produk + lokasi:

| Kolom | Sumber |
|---|---|
| `total_qty` | `sum(remaining_qty)` |
| `active_batches` | `count(*) filter (where remaining_qty > 0)` |
| `nearest_expiry` | `min(expires_at)` (perishable & remaining_qty>0) |
| `oldest_produced_at` | `min(produced_at)` (remaining_qty>0) |

View tunduk RLS dari tabel sumber (`stock_batches`, `products`, `locations`).
Tidak perlu policy terpisah.


---

## Migration `transfer_functions` (Iterasi 3)

Lima Postgres function yang menjadi sumber kebenaran tunggal untuk seluruh
siklus hidup transfer. Semua di-`security definer` karena perlu menulis batch
tujuan di lokasi yang berbeda dari outlet pemanggil â€” pengecekan otorisasi
dilakukan eksplisit di awal tiap function.

### `fn_create_transfer(p_from, p_to, p_mode, p_notes, p_items)`
- `p_items` adalah `jsonb` array `[{source_batch_id, quantity}, â€¦]`.
- Validasi: lokasi berbeda, mode wajib, minimal 1 item, batch sumber harus
  berada di lokasi asal & punya cukup stok. Caller wajib pengirim (kasir
  hanya boleh `from = outlet_id`-nya, atau Super Admin).
- Untuk tiap item: kunci batch (`for update`), kurangi `remaining_qty`,
  catat `transfer_out`, insert `transfer_items`.
- **Mode `one_way`**: langsung buat batch tujuan (mewarisi `produced_at` &
  `expires_at` dari sumber), catat `transfer_in`, set
  `transfers.status='received'` dengan `shipped_at = received_at = now()`.
- **Mode `two_way`**: status `pending`, batch tujuan belum dibuat.
- Returns `uuid` transfer baru.

### `fn_ship_transfer(p_transfer_id)`
- Hanya untuk two-way pending â†’ set status `in_transit`, isi `shipped_at`.
  Tahap ini opsional (UI menampilkannya untuk kebutuhan tracking fisik).

### `fn_confirm_transfer(p_transfer_id)`
- Penerima (atau admin) mengubah status menjadi `received`.
- Idempotent untuk `transfer_items.destination_batch_id` yang sudah terisi
  (skip pembuatan ganda kalau dipanggil dua kali).
- Untuk tiap item belum dibuat: insert batch tujuan dari snapshot batch
  sumber + catat `transfer_in`.

### `fn_cancel_transfer(p_transfer_id)`
- Pengirim membatalkan saat masih `pending`/`in_transit`.
- Memanggil helper `_tx_restore_source` yang mengembalikan stok ke batch
  sumber + catat `adjustment_in` dengan label "Pembatalan transfer".

### `fn_reject_transfer(p_transfer_id, p_reason?)`
- Penerima menolak. Stok dikembalikan via helper yang sama. Alasan
  ditambahkan ke `transfers.notes` sebagai baris baru (`Alasan tolak: â€¦`).

### Aturan idempotensi & atomik

- Function memakai `for update` di tabel `transfers` & `stock_batches`
  agar dua user yang menekan tombol bersamaan tetap aman.
- Pengembalian stok memvalidasi `remaining_qty + qty <= initial_qty` agar
  tidak melebihi kapasitas batch (misal jika ada movement lain di antaranya).


---

## Migration `sales_and_eod` (Iterasi 4)

### `fn_record_sale(p_location_id, p_occurred_at, p_notes, p_items)`
- `p_items` adalah `jsonb`: `[{product_id, quantity, override_batch_id?}]`.
- Kasir hanya boleh `p_location_id = outlet_id`-nya; admin bebas.
- Per item: insert `sale_items` lalu panggil `fn_deduct_stock_fifo`. Multi-batch
  otomatis (mis. terjual 5 box, batch tertua hanya 3 â†’ sisa 2 dari batch berikut).
- Returns `uuid` sale baru.

### `fn_record_disposal(p_product_id, p_location_id, p_quantity, p_movement_type, p_batch_id?, p_notes?, p_occurred_at?)`
- `p_movement_type` harus `expired_out`, `damage_out`, atau `adjustment_out`.
- Wraper di atas `fn_deduct_stock_fifo` dengan `reference_type='disposal'`.
- Returns total qty terbuang (numeric) â€” berguna untuk konfirmasi UI.

### `fn_eod_report(p_location_id, p_date)` â†’ `jsonb`
- Tanggal lokal `Asia/Jakarta`. Rentang `[date 00:00, date+1 00:00)`.
- Output:
  ```jsonc
  {
    "sold": [
      { "product_id", "sku", "name", "unit", "quantity" }
    ],
    "stock_now": [
      {
        "product_id", "sku", "name", "unit", "total",
        "batches": [{ "date": "YYYY-MM-DD", "qty" }, ...]
      }
    ]
  }
  ```
- `sold` di-aggregate dari `stock_movements` `sale_out` di rentang tanggal.
- `stock_now` mengelompokkan `stock_batches` aktif per produk lalu per tanggal
  produksi/entry (sesuai contoh format EOD pada PRD).
- Format jadi text WhatsApp dilakukan di klien (`buildEodText` di
  `eod-panel.tsx`) supaya bisa custom tanpa migration baru.


---

## Migration `inventory_matrix` (Iterasi 5)

### `fn_inventory_matrix(p_date, p_location_id?)` â†’ `setof inventory_matrix_row`

Inti laporan harian. Output satu baris per `(product_id, location_id)`
yang punya aktivitas di tanggal target ATAU saldo opening â‰  0.

**Logika** (semua di tanggal lokal `Asia/Jakarta`):

1. `before_movs` â€” agregat net movement sebelum `v_start` per produk +
   lokasi. Tanda `+` untuk movement IN, `âˆ’` untuk OUT. Jadi nilai
   `opening`.
2. `agg_day` â€” agregat movement pada `[v_start, v_end)` per movement_type.
3. `combined` â€” full outer join 1 + 2. Kolom yang tidak terjadi di hari
   itu di-coalesce ke 0.
4. `closing = opening + (produced_in + entered_in + transfer_in + adjustment_in)
              âˆ’ (transfer_out + sold + expired_out + damage_out + adjustment_out)`

Jika `p_location_id` NULL â†’ semua lokasi (RLS biasa membatasi visibilitas).

Filter mengabaikan baris yang opening 0 dan tidak ada movement (idle).

### `fn_inventory_matrix_cell(product_id, location_id, date, kind)`

Drilldown movement individual untuk satu sel matrix. `kind` mendukung:

| Kind | Movement types |
|---|---|
| `in` | production_in + entry_in + transfer_in + adjustment_in |
| `out` | sale_out + transfer_out + expired_out + damage_out + adjustment_out |
| `sold` | sale_out |
| `transfer_in` / `transfer_out` | sesuai nama |
| `produced` / `entered` | production_in / entry_in |
| `expired` / `damage` | expired_out / damage_out |
| `adjustment_in` / `adjustment_out` | sesuai nama |

Returns kolom waktu, tipe, qty, batch + produced_at, reference, notes,
nama aktor (`profiles.full_name`).

### Catatan implementasi

- Tipe komposit `inventory_matrix_row` dipakai sebagai return type untuk
  menjaga skema kolom konsisten (DDL `create type if not exists`).
- Function `security invoker` agar RLS user dievaluasi â€” kasir tetap
  hanya melihat lokasi yang policy izinkan.
- Tidak ada materialized view â€” query cukup cepat dengan index
  `idx_movements_loc_date` yang sudah ada di migration awal.
