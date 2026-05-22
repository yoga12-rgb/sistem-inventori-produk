# Arsitektur

## Tech Stack

| Lapisan   | Pilihan                                        |
| --------- | ---------------------------------------------- |
| Framework | **Next.js 16** (App Router, Turbopack default) |
| Bahasa    | TypeScript 5+, React 19.2                      |
| Styling   | Tailwind CSS v4 + design tokens (light/dark)   |
| Backend   | Supabase (PostgreSQL, Auth, Realtime)          |
| Form      | Server Actions + `useActionState` + Zod v4     |
| Theming   | `next-themes` (class strategy)                 |
| Hosting   | Vercel                                         |

## Catatan penting Next.js 16

> File ini bukan Next.js yang ada di training data Anda. Beberapa breaking change
> yang kami terapkan secara konsisten:

1. **`middleware.ts` → `proxy.ts`**, fungsi `middleware` → `proxy`.
   - Tidak ada edge runtime — `proxy` hanya berjalan di Node.
   - File kami di `src/proxy.ts`.
2. **Async Request APIs** (`cookies()`, `headers()`, `params`, `searchParams`) wajib di-`await`.
3. **Turbopack default** untuk `dev` & `build` — tidak perlu flag `--turbopack`.
4. **`next/link` prefetch** sudah cukup untuk navigasi SPA-like; tidak perlu router custom.
5. **Tailwind v4** menggunakan `@import "tailwindcss"` + `@theme inline { … }` di CSS,
   bukan `tailwind.config.js`.
6. **Server Actions + `useActionState`**: form master-data memakai pola
   `<form action={action}>` dengan validasi Zod di server. Hasil action
   dikembalikan sebagai state objek `{ ok, message?, fieldErrors? }`.

## Struktur folder

```
src/
├─ app/                              # Next.js App Router
│  ├─ layout.tsx                     # ThemeProvider + viewport (tablet-first)
│  ├─ globals.css                    # Tailwind v4 + design tokens (orange primary)
│  ├─ login/                         # Halaman publik
│  │  ├─ page.tsx                    # async searchParams (Next 16)
│  │  └─ login-form.tsx              # Client form (RHF + Zod)
│  └─ (app)/                         # Route group: semua halaman privat
│     ├─ layout.tsx                  # Memuat AppShell + cek session + MasterDataProvider
│     ├─ actions.ts                  # signOutAction
│     ├─ page.tsx                    # Dashboard (stat ringkas + expired banner + transfer inbox)
│     ├─ stok/                       # View stok per lokasi + disposal modal
│     ├─ produksi/                   # Catat produksi (perishable) + stok masuk (non-perishable) + riwayat
│     ├─ penjualan/                  # POS-style layout (grid kiri + cart kanan)
│     ├─ transfer/                   # Daftar, buat, detail, edit pending, konfirmasi parsial
│     ├─ eod/                        # End of Day Report + share WhatsApp
│     ├─ matrix/                     # Inventory Matrix harian
│     ├─ aktivitas/                  # Log aktivitas (200 movement terbaru)
│     └─ master/
│        ├─ outlets/                 # CRUD locations
│        ├─ categories/              # CRUD product_categories
│        ├─ products/                # CRUD products
│        └─ users/                   # CRUD profiles + auth users (admin client)
├─ components/
│  ├─ app-shell.tsx                  # Sidebar nav + header + sign-out + slot aksi
│  ├─ master-data-provider.tsx       # Master data in-memory (locations + categories + products)
│  ├─ register-page-action.tsx       # Slot outlet untuk aksi halaman di top bar
│  ├─ transfer-inbox.tsx             # Provider notifikasi transfer pending masuk
│  ├─ theme-provider.tsx
│  ├─ theme-toggle.tsx
│  └─ ui/                            # Primitives (shadcn-style)
│     ├─ button.tsx, input.tsx, label.tsx, textarea.tsx
│     ├─ select.tsx, switch.tsx, badge.tsx, card.tsx
│     ├─ table.tsx, modal.tsx, form-field.tsx
│     ├─ empty-state.tsx, toast.tsx
├─ lib/
│  ├─ env.ts                         # Akses env yang aman + error helpful
│  ├─ utils.ts                       # cn() – class merger
│  ├─ auth.ts                        # getCurrentUser / requireSuperAdmin
│  ├─ format.ts                      # formatDate, formatDateTime, formatNumber, hoursBetween
│  ├─ master-data.ts                 # Tipe canonical + getMasterData (cached)
│  ├─ transfer.ts                    # Label & variant helpers untuk transfer status/mode
│  └─ supabase/
│     ├─ client.ts                   # Browser client
│     ├─ server.ts                   # Server client (await cookies())
│     ├─ middleware.ts               # Helper proxy: refresh session + guard
│     └─ admin.ts                    # SERVICE-ROLE client (server-only!)
└─ proxy.ts                          # Next 16 proxy entry — wrap updateSession()

supabase/
├─ config.toml
└─ migrations/
   ├─ 20260518163121_init_schema.sql
   ├─ 20260518171640_stock_functions.sql
   ├─ 20260518173312_transfer_functions.sql
   ├─ 20260518174434_sales_and_eod.sql
   ├─ 20260518175519_inventory_matrix.sql
   ├─ 20260518223727_transfer_integer_qty.sql
   ├─ 20260518224441_integer_quantity_everywhere.sql
   ├─ 20260518224951_production_batch_multi.sql
   ├─ 20260520100000_disposal_categories_enum.sql
   ├─ 20260520100100_disposal_functions_update.sql
   ├─ 20260520200000_product_categories.sql
   ├─ 20260520200100_stock_view_with_category.sql
   ├─ 20260520210000_eod_indexes.sql
   ├─ 20260520220000_profiles_read_all_auth.sql
   ├─ 20260522050300_sales_void.sql
   ├─ 20260522053152_transfer_partial_receive_and_edit.sql
   └─ 20260522061934_transfer_code_format.sql
```

### Pola MasterDataProvider

Data master (locations aktif, categories aktif, products aktif) di-fetch **sekali** di layout server (`(app)/layout.tsx`) lalu disebar ke semua child via React Context. Ini menghindari fetch berulang di setiap halaman.

```tsx
// (app)/layout.tsx
const masterData = await getMasterData();
<MasterDataProvider data={masterData}>
  <AppShell> {children} </AppShell>
</MasterDataProvider>;
```

Konsumen memanggil `useMasterData()` untuk akses O(1) via `productById`, `categoryById`, `locationById` Map. Mutasi master memicu `revalidatePath("/", "layout")` → layout RSC re-fetch → provider menerima props baru.

### Pola RegisterPageAction

Halaman dapat "mendaftarkan" tombol aksi (misal "Tambah Produk", "Buat Transfer") yang muncul di header/top bar AppShell, bukan di dalam konten halaman. Komponen `RegisterPageAction` menggunakan React context untuk slot outlet.

## Realtime

- Tabel yang berperan dalam UI live dipublikasikan ke `supabase_realtime`:
  `stock_batches`, `stock_movements`, `sales`, `sale_items`, `transfers`, `transfer_items`.
- Komponen klien membuka channel via `createSupabaseBrowserClient()` di dalam `useEffect`, lalu cleanup `removeChannel(channel)` saat unmount.

## Auth flow

1. User membuka rute non-publik tanpa session → `proxy.ts` redirect ke `/login?next=…`.
2. `/login` memanggil `supabase.auth.signInWithPassword`. Sukses → `router.replace(next)` + `router.refresh()`.
3. Cookie auth Supabase di-rotate oleh `proxy.ts` setiap request.
4. Route group `(app)` punya `layout.tsx` yang re-check session dan menampilkan nav role-aware (kasir tidak melihat menu master data).

## Hak akses

Diterapkan di **dua lapis**:

- **Database (RLS)** — sumber kebenaran. Lihat policy di migration init dan migration sales_void.
- **UI** — `requireSuperAdmin()` di Server Component pages, plus filter nav di `app-shell.tsx`. Untuk operasi yang butuh bypass RLS (membuat auth user, meng-list semua user), gunakan `createSupabaseAdminClient()` — server-only.
