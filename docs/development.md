# Development

## Prasyarat

| Tool           | Versi minimum                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js        | 20.9 LTS (Next.js 16 minimum). **PERHATIAN:** Node 24+ punya regresi di image Supabase Postgres terbaru — jika menggunakan Node 24, ikuti catatan di bawah. |
| npm            | 10+                                                                                                                                                         |
| Docker Desktop | aktif (untuk Supabase lokal)                                                                                                                                |

## Catatan penting: Supabase CLI di-pin ke v2.84.0

Proyek ini **memilih Supabase CLI versi 2.84.0** (bukan latest) karena
versi yang lebih baru (≥ 2.85) menarik image `supabase/postgres:17.6.x`
yang punya bug `ERR_INVALID_PACKAGE_CONFIG` di realtime init script saat
dijalankan di host Node 24+. Bug ini terjadi sebelum migration sempat
di-apply.

Jika kamu meng-update `package.json` dan ingin upgrade CLI:

1. Coba `npm i -D supabase@latest` lalu `npx supabase start`
2. Kalau crash di `Initialising schema...` dengan `Invalid package
config /app/package.json`:
   - Rollback: `npm i -D supabase@2.84.0`
   - Hapus image yang berkonflik: `docker rmi public.ecr.aws/supabase/postgres:<tag> -f`
   - Mulai ulang: `npx supabase start`
3. Untuk realtime: `[realtime] enabled = false` di `supabase/config.toml`
   memang sengaja dimatikan di lokal. Aktifkan kembali kalau image baru
   sudah aman.

## Service yang disabled di lokal

`supabase/config.toml` mengatur dua service ke `enabled = false`. Bukan
pilihan dari proyek — ini workaround bug di image lokal yang tidak terjadi
di Supabase Cloud:

| Service     | Alasan                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realtime`  | Image v2.86.3 punya bug `Invalid package config` di Node 24. App tetap berfungsi karena halaman menyediakan tombol "Muat ulang".                                  |
| `analytics` | Container `vector` (log forwarder) restart-loop karena tidak bisa konek Docker socket di Windows, memunculkan spam `Compaction failed`. Tidak menyentuh data app. |

Saat deploy ke production, kedua service ini aktif dan berfungsi normal.

## Setup pertama kali

```cmd
:: 1. Install dependencies
npm install

:: 2. Salin env contoh dan isi sesuai output `supabase start`
copy .env.example .env.local

:: 3. Jalankan Supabase lokal (perlu Docker aktif)
npx supabase start
```

`supabase start` akan mencetak `API URL`, `anon key`, dan `service_role key`.
Salin ketiganya ke `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<API URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

> `SUPABASE_SERVICE_ROLE_KEY` hanya diperlukan untuk fitur Super Admin yang
> membuat / mereset akun pengguna. Server-only — JANGAN expose ke browser.

```cmd
:: 4. Apply seluruh migration ke DB lokal
npx supabase db reset

:: 5. Jalankan Next.js dev server (Turbopack default di Next 16)
npm run dev
```

App: <http://localhost:3000>
Supabase Studio: <http://localhost:54323>

## Membuat akun Super Admin pertama

Karena pendaftaran tidak terbuka, akun pertama harus dibuat manual:

1. Buka **Studio → Authentication → Users → "Add user"** → email + password.
2. Buka **SQL Editor** dan jalankan (sekali saja, ganti `<USER_ID>`):

```sql
insert into public.profiles (id, full_name, role)
values ('<USER_ID>', 'Super Admin', 'super_admin');
```

Setelah ini:

- Login lewat <http://localhost:3000/login>.
- Sebagai Super Admin, buka menu **Pengguna** untuk membuat akun kasir/admin
  selanjutnya — tidak perlu masuk Studio lagi.

## Membuat migration baru

```cmd
npx supabase migration new <nama_migrasi>
```

Edit file SQL yang dihasilkan, lalu:

```cmd
npx supabase db reset      :: full reset DB lokal + apply semua migration
:: atau
npx supabase migration up  :: apply migration yang belum jalan
```

## Sync types TypeScript

Setelah migration berubah, sinkronkan tipe TypeScript:

```cmd
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

## Verifikasi migration terbaru (Iterasi 8)

Setelah `npx supabase db reset`, verifikasi fitur baru:

### Void Sale

```sql
-- Cek enum value baru
select enum_range(null::public.stock_movement_type);
-- Harus termasuk 'sale_void'

-- Cek kolom baru di sales
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sales';
-- Harus ada: voided_at, voided_by, void_reason

-- Test function
select public.fn_void_sale('<sale_id>', 'Test void');
```

### Transfer Partial Receive

```sql
-- Cek enum value baru
-- Harus termasuk 'transfer_loss'

-- Cek kolom baru di transfer_items
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'transfer_items';
-- Harus ada: received_qty, loss_reason

-- Cek constraint
select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.transfer_items'::regclass
and conname = 'transfer_items_received_qty_range';
```

### Transfer Code Format

```sql
-- Cek format kode baru
select code from public.transfers order by created_at desc limit 5;
-- Format: TR-[KODE_ASAL]-[KODE_TUJUAN]-[N]-YYYY-MM-DD
```

## Push ke staging / production

```cmd
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## Skrip useful

| Skrip                                                                            | Tujuan                            |
| -------------------------------------------------------------------------------- | --------------------------------- |
| `npm run dev`                                                                    | Next.js dev server (Turbopack)    |
| `npm run build`                                                                  | Production build (Turbopack)      |
| `npm start`                                                                      | Start production build            |
| `npm run lint`                                                                   | ESLint                            |
| `npx tsc --noEmit`                                                               | Type check                        |
| `npx next typegen`                                                               | Re-generate route/PageProps types |
| `npx supabase status`                                                            | Lihat URL & key Supabase lokal    |
| `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts` | Sync tipe DB                      |

## Tablet emulator (uji UI kasir)

Chrome DevTools → **Toggle device toolbar** → preset **iPad** atau **iPad Pro**.
Sebelum testing transaksi panjang, set network ke "Fast 3G" untuk memastikan
SPA prefetch (`next/link`) terasa instan.
