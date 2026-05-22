# Database

Sumber kebenaran skema ada di `supabase/migrations/`. Dokumen ini hanya peta tingkat tinggi.

> ⚠️ **JANGAN** edit skema lewat dashboard Supabase cloud. Semua perubahan
> melalui `npx supabase migration new <nama>` lalu commit.

## Diagram entitas

```
locations ──┬── profiles (cashier.outlet_id)
            │
            ├── stock_batches ── stock_movements
            │
            ├── sales ── sale_items
            │
            └── transfers ── transfer_items

product_categories ── products
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
- RLS: `profiles_read_all_auth` — semua authenticated user boleh baca (diperlukan untuk join nama aktor). Update/delete tetap super_admin only.

### `products`

Tiap **varian = satu baris** dengan SKU sendiri.

- `is_perishable`: false ⇒ semua logika expired di-bypass.
- `default_shelf_life_hours`: dipakai trigger `tg_batch_set_expiry` untuk mengisi `expires_at` otomatis bila tidak diisi manual.
- `expiry_warning_hours`: jam sebelum expired untuk menyalakan warning UI.
- `expiry_discount_percent`: saran diskon otomatis.
- `category_id`: nullable FK ke `product_categories`.

### `product_categories`

Tabel master kategori produk. Field:

- `id` (uuid, PK), `code` (text, unique), `name` (text), `icon` (text, nullable), `color` (text, nullable), `sort` (integer), `is_active` (boolean, default true).
  RLS: read untuk semua authenticated, write hanya `super_admin`.

### `stock_batches`

Granularitas pelacakan stok. Setiap batch punya:

- `product_id`, `location_id`, `produced_at`, `expires_at`.
- `initial_qty` (tidak boleh berubah), `remaining_qty` (turun seiring movement).
- `source_batch_id`: terisi bila batch dibuat dari transfer (warisan FIFO).

### `stock_movements`

Audit trail seluruh perubahan stok. Tipe:

| `movement_type`                    | Arah         | Pemicu                                                                                                                           |
| ---------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `production_in`                    | +            | Produksi di Central Pastry                                                                                                       |
| `entry_in`                         | +            | Pemasukan stok non-perishable                                                                                                    |
| `sale_out`                         | −            | Penjualan                                                                                                                        |
| `sale_void`                        | +            | Reversal stok saat void sale                                                                                                     |
| `expired_out`                      | −            | Buang karena lewat expired (perishable only)                                                                                     |
| `compliment_out`                   | −            | Diberikan sebagai compliment / hadiah                                                                                            |
| `tester_out`                       | −            | Dijadikan tester / sample                                                                                                        |
| `damage_out`                       | −            | Rusak / waste                                                                                                                    |
| `adjustment_in` / `adjustment_out` | ±            | Penyesuaian sistem (pembatalan transfer). Tidak diekspos ke kasir di UI.                                                         |
| `transfer_out` / `transfer_in`     | − / +        | Transfer antar lokasi                                                                                                            |
| `transfer_loss`                    | − (log only) | Susut transit — selisih qty kirim vs terima. Dicatat di lokasi asal tanpa mengubah remaining_qty batch (sudah deduct di create). |

### `sales` / `sale_items`

- 1 transaksi = 1 row `sales`, multi-item via `sale_items`.
- `sale_items.override_batch_id` ≠ NULL ⇒ kasir override FIFO.
- `sales.voided_at`, `voided_by`, `void_reason` — soft delete untuk void. Sale tetap di DB untuk jejak audit.
- `idx_sales_voided_at` — index untuk filter.

### `transfers` / `transfer_items`

- `mode = one_way`: status loncat langsung ke `received`.
- `mode = two_way`: alur `pending → in_transit → received | rejected | cancelled`.
- `transfer_items.destination_batch_id` di-set saat batch baru dibuat di lokasi tujuan.
- `transfer_items.received_qty` & `loss_reason` — untuk penerimaan parsial (partial receive). Nilai null saat masih pending; setelah confirm wajib terisi. Constraint: `0 <= received_qty <= quantity`.
- Format kode transfer: `TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD` (contoh: `TR-PRO-CLD-1-2026-05-22`). Counter per pasangan asal+tujuan per hari, monotonik. Menggunakan `pg_advisory_xact_lock` untuk anti race-condition.

## Indeks

| Index                                                            | Tujuan                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `idx_products_sku`                                               | Lookup cepat per SKU                                                                                         |
| `idx_products_category`                                          | Filter produk per kategori                                                                                   |
| `idx_product_categories_active_sort` (partial: `is_active`)      | Render chip kategori berurutan                                                                               |
| `idx_batches_fifo` (partial: `remaining_qty > 0`)                | FIFO scan per product+location                                                                               |
| `idx_batches_expires_at` (partial: not null)                     | Notifikasi expired                                                                                           |
| `idx_movements_loc_date`                                         | Inventory matrix per outlet/tanggal (general)                                                                |
| `idx_movements_eod_lookup`                                       | **EOD per kategori & matrix per movement_type** — composite `(location_id, movement_type, occurred_at desc)` |
| `idx_movements_sale_out` (partial: `movement_type = 'sale_out'`) | **Riwayat penjualan & EOD Terjual** — partial index, footprint kecil                                         |
| `idx_sales_location_date`                                        | EOD sales header                                                                                             |
| `idx_sales_voided_at`                                            | Filter sales yang sudah di-void                                                                              |
| `idx_transfers_status` / `_from_loc` / `_to_loc`                 | Inbox transfer                                                                                               |

## Trigger

- `tg_set_updated_at` — update `updated_at` di seluruh tabel master.
- `tg_batch_set_expiry` — auto isi `expires_at` saat insert batch perishable; auto NULL untuk non-perishable.

## Helper RLS

Tiga function `security definer` membaca `profiles` user saat ini:

- `current_role()` → `user_role`
- `current_outlet_id()` → `uuid`
- `is_super_admin()` → `boolean`

Dipakai dalam policy untuk mengizinkan kasir hanya menulis ke outlet sendiri.

## Realtime

Yang dipublikasi ke `supabase_realtime`:
`stock_batches`, `stock_movements`, `sales`, `sale_items`, `transfers`,
`transfer_items`. Ini menutupi seluruh perubahan yang tampil di Inventory Matrix
& Inbox Transfer.

---

## Migration `stock_functions` (Iterasi 2)

Menambahkan tiga function Postgres + satu view agregat. Semua function `security invoker` agar RLS user yang memanggil tetap dievaluasi.

### `fn_record_production(p_product_id, p_location_id, p_quantity, p_produced_at?, p_expires_at?, p_notes?)`

### `fn_record_stock_entry(p_product_id, p_location_id, p_quantity, p_entered_at?, p_notes?)`

### `fn_deduct_stock_fifo(p_product_id, p_location_id, p_quantity, p_movement_type, p_batch_id?, p_reference_type?, p_reference_id?, p_occurred_at?, p_notes?)`

### View `v_stock_per_location`

Agregat `remaining_qty > 0` per produk + lokasi. Extended dengan kolom `category_code` dan `category_name` (join ke `product_categories`).

---

## Migration `transfer_functions` (Iterasi 3)

Lima Postgres function yang menjadi sumber kebenaran tunggal untuk seluruh siklus hidup transfer.

### `fn_create_transfer(p_from, p_to, p_mode, p_notes, p_items)`

### `fn_ship_transfer(p_transfer_id)`

### `fn_confirm_transfer(p_transfer_id, p_items?)`

— Mendukung penerimaan parsial via `p_items` JSONB opsional. Setiap entry: `{ item_id, received_qty, loss_reason? }`. Selisih dicatat sebagai `transfer_loss` di lokasi asal.

### `fn_cancel_transfer(p_transfer_id)`

### `fn_reject_transfer(p_transfer_id, p_reason?)`

### `fn_update_transfer_items(p_transfer_id, p_items)`

— Edit qty/item selama status `pending`. Rebuild: kembalikan stok lama, deduct ulang.

### Transfer code format (migration terbaru)

Format: `TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD`. Menggunakan `pg_advisory_xact_lock` untuk menjamin counter monotonik tanpa race condition.

---

## Migration `sales_and_eod` (Iterasi 4)

### `fn_record_sale(p_location_id, p_occurred_at, p_notes, p_items)`

### `fn_record_disposal(p_product_id, p_location_id, p_quantity, p_movement_type, p_batch_id?, p_notes?, p_occurred_at?)`

### `fn_eod_report(p_location_id, p_date)` → `jsonb`

Sekarang mengecualikan sale yang di-void (`sale_out - sale_void`).

---

## Migration `inventory_matrix` (Iterasi 5)

### `fn_inventory_matrix(p_date, p_location_id?)` → `setof inventory_matrix_row`

### `fn_inventory_matrix_cell(product_id, location_id, date, kind)`

Kolom matrix sekarang termasuk `transfer_loss`. Rumus closing:

```
closing = opening + produced_in + entered_in + transfer_in + adjustment_in
         - transfer_out - transfer_loss - sold
         - expired_out - damage_out - compliment_out - tester_out
         - adjustment_out
```

`sold` sekarang NET: `sale_out - sale_void`.

---

## Migration `sales_void` (Iterasi 8)

### Enum `sale_void`

Tipe movement baru: `sale_void` untuk reversal stok saat void sale.

### Kolom soft-delete di `sales`

`voided_at`, `voided_by`, `void_reason`.

### RLS untuk UPDATE sales

Kasir hanya boleh void sale-nya sendiri di hari yang sama (Asia/Jakarta). Super admin bebas.

### `fn_void_sale(p_sale_id, p_reason?)`

Membatalkan satu sale: tandai voided + buat reversal movements. Idempotent.

---

## Migration `transfer_partial_receive_and_edit` (Iterasi 8)

### Enum `transfer_loss`

Tipe movement baru untuk susut transit.

### Kolom baru `transfer_items`

`received_qty` (numeric, nullable), `loss_reason` (text). Constraint: `0 <= received_qty <= quantity`.

### `fn_confirm_transfer` — signature baru

Parameter opsional `p_items jsonb`. Partial receive: tiap item punya `received_qty` dan `loss_reason`. Default terima utuh.

### `fn_update_transfer_items`

Edit qty/item transfer saat status `pending`. Rebuild items.

---

## Migration `transfer_code_format` (Iterasi 8)

### Format kode baru

`TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD` dengan `pg_advisory_xact_lock` untuk anti race.
