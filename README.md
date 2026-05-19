# Sistem Inventaris Multi-Outlet

Aplikasi berbasis Next.js 16 + Supabase untuk manajemen inventaris,
produksi, dan transfer stok antar outlet secara real-time.

📐 **Spesifikasi produk** ada di [`PRD.md`](./PRD.md).
🛠 **Aturan kolaborasi agent** ada di [`agent.md`](./agent.md) dan [`AGENTS.md`](./AGENTS.md).
📚 **Dokumentasi teknis** lengkap ada di [`docs/`](./docs/README.md).

## Quick Start

```cmd
:: 1. Dependencies
npm install

:: 2. Salin & isi env (lihat docs/development.md)
copy .env.example .env.local

:: 3. Supabase lokal (perlu Docker Desktop aktif)
npx supabase start
npx supabase db reset

:: 4. Dev server (Turbopack default di Next 16)
npm run dev
```

Buka <http://localhost:3000>. Studio Supabase: <http://localhost:54323>.
Cara membuat akun Super Admin pertama: lihat [`docs/development.md`](./docs/development.md).

## Skrip

| Skrip | Tujuan |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Start production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npx supabase migration new <nama>` | Buat migration baru |
| `npx supabase db reset` | Re-apply semua migration ke DB lokal |

## Stack singkat

- **Next.js 16** (App Router, Turbopack default)
- **React 19.2** + TypeScript 5
- **Tailwind v4** (design tokens, dark mode via `next-themes`, aksen oranye)
- **Supabase** (PostgreSQL, Auth, Realtime)
- **React Hook Form + Zod** untuk form

## Struktur

```
src/
├─ app/                # Routes (App Router)
├─ components/         # UI components (theme, dll.)
├─ lib/                # env, utils, supabase clients
└─ proxy.ts            # Next 16 proxy: refresh session + auth guard

supabase/
├─ config.toml
└─ migrations/         # Single source of truth untuk skema DB

docs/                  # Dokumentasi teknis (selalu di-update saat berubah)
```
