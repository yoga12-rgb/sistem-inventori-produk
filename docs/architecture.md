# Arsitektur

## Tech Stack

| Lapisan | Pilihan |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack default) |
| Bahasa | TypeScript 5+, React 19.2 |
| Styling | Tailwind CSS v4 + design tokens (light/dark) |
| Backend | Supabase (PostgreSQL, Auth, Realtime) |
| Form | React Hook Form + Zod *(kanvas baru: form actions + Zod parsing)* |
| Theming | `next-themes` (class strategy) |
| Hosting | Vercel |

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
│     ├─ layout.tsx                  # Memuat AppShell + cek session
│     ├─ actions.ts                  # signOutAction
│     ├─ page.tsx                    # Dashboard (stat ringkas)
│     └─ master/
│        ├─ outlets/                 # CRUD locations
│        │  ├─ page.tsx
│        │  ├─ outlet-form-dialog.tsx
│        │  ├─ toggle-active.tsx
│        │  └─ actions.ts            # Server Actions (Zod, RLS-aware)
│        ├─ products/                # CRUD products
│        └─ users/                   # CRUD profiles + auth users (admin client)
├─ components/
│  ├─ app-shell.tsx                  # Sidebar nav + header + sign-out
│  ├─ theme-provider.tsx
│  ├─ theme-toggle.tsx
│  └─ ui/                            # Primitives (shadcn-style)
│     ├─ button.tsx, input.tsx, label.tsx, textarea.tsx
│     ├─ select.tsx, switch.tsx, badge.tsx, card.tsx
│     ├─ table.tsx, modal.tsx, form-field.tsx
├─ lib/
│  ├─ env.ts                         # Akses env yang aman + error helpful
│  ├─ utils.ts                       # cn() – class merger
│  ├─ auth.ts                        # getCurrentUser / requireSuperAdmin
│  └─ supabase/
│     ├─ client.ts                   # Browser client
│     ├─ server.ts                   # Server client (await cookies())
│     ├─ middleware.ts               # Helper proxy: refresh session + guard
│     └─ admin.ts                    # SERVICE-ROLE client (server-only!)
└─ proxy.ts                          # Next 16 proxy entry — wrap updateSession()

supabase/
├─ config.toml
└─ migrations/
   └─ <timestamp>_init_schema.sql
```

## Realtime

- Tabel yang berperan dalam UI live (lihat `docs/database.md`) dipublikasikan ke
  `supabase_realtime`.
- Komponen klien membuka channel via `createSupabaseBrowserClient()` di dalam
  `useEffect`, lalu cleanup `removeChannel(channel)` saat unmount.

## Auth flow

1. User membuka rute non-publik tanpa session → `proxy.ts` redirect ke `/login?next=…`.
2. `/login` memanggil `supabase.auth.signInWithPassword`. Sukses → `router.replace(next)`
   + `router.refresh()` agar Server Components mengambil session baru.
3. Cookie auth Supabase di-rotate oleh `proxy.ts` setiap request.
4. Route group `(app)` punya `layout.tsx` yang re-check session dan menampilkan
   nav role-aware (kasir tidak melihat menu master data).

## Hak akses

Diterapkan di **dua lapis**:

- **Database (RLS)** — sumber kebenaran. Lihat policy di migration init.
- **UI** — `requireSuperAdmin()` di Server Component pages, plus filter nav di
  `app-shell.tsx`. Untuk operasi yang butuh bypass RLS (membuat auth user,
  meng-list semua user), gunakan `createSupabaseAdminClient()` — server-only.
