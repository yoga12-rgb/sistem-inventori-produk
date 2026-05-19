# Deployment

Aplikasi ini di-deploy ke **Vercel** (Next.js host) + **Supabase Cloud**
(Postgres, Auth, Realtime). Lokal kita pakai Supabase CLI; produksi kita
pakai project Supabase berbayar/free tier.

## 1. Siapkan project Supabase

1. Login ke <https://supabase.com> dan buat project baru.
   - Region: pilih yang dekat user (mis. `Singapore` untuk pasar ID).
   - Pricing: Free tier cukup untuk POC; production disarankan Pro.
2. Catat dari **Settings → API**:
   - `Project URL` → akan jadi `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only!)

## 2. Push schema ke Supabase Cloud

Dari mesin development:

```cmd
:: Login Supabase CLI
npx supabase login

:: Link project lokal ke remote (akan minta DB password)
npx supabase link --project-ref <project-ref>

:: Apply semua migration ke remote
npx supabase db push
```

Jika kamu sudah pernah `db push`, CLI akan diff dan hanya apply yang baru.

> Setelah push, JANGAN edit schema lewat dashboard. Selalu lewat migration
> baru di lokal lalu `db push`.

## 3. Buat Super Admin pertama (di production)

Sama seperti di lokal:

1. Supabase Dashboard → **Authentication → Users → Add user** → email + password.
2. SQL Editor → jalankan (ganti `<USER_ID>`):
   ```sql
   insert into public.profiles (id, full_name, role)
   values ('<USER_ID>', 'Super Admin', 'super_admin');
   ```

## 4. Aktifkan Realtime publication

Migration init kita sudah memanggil `alter publication supabase_realtime add
table ...`, tapi untuk berjaga-jaga cek:

- Dashboard → **Database → Replication → supabase_realtime**
- Pastikan tabel berikut tercentang:
  `stock_batches`, `stock_movements`, `sales`, `sale_items`,
  `transfers`, `transfer_items`.

Realtime di Cloud tidak terdampak bug Node 24 yang kita hadapi di lokal.

## 5. Deploy ke Vercel

1. Push repo ke GitHub/GitLab/Bitbucket.
2. <https://vercel.com/new> → import repo.
3. **Build & Output Settings**:
   - Framework: Next.js (auto-detect)
   - Root directory: `/`
4. **Environment Variables** (Production + Preview + Development):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
   SUPABASE_SERVICE_ROLE_KEY=eyJ…
   ```
   > `SUPABASE_SERVICE_ROLE_KEY` tandai **NOT exposed to browser**
   > (Vercel default — selama tidak diawali `NEXT_PUBLIC_`, aman).
5. Klik **Deploy**. Build pertama biasanya 2–4 menit.

## 6. Konfigurasi Supabase Auth untuk production URL

Setelah Vercel kasih URL (mis. `https://inventory.example.com`):

1. Dashboard Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://inventory.example.com`
   - **Redirect URLs**: tambahkan domain produksi (dan preview Vercel jika
     ingin login berjalan di branch preview).

## 7. Production checklist

- [ ] HTTPS aktif (Vercel otomatis menerbitkan TLS).
- [ ] Security headers terpasang (sudah di `next.config.ts`):
      `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
      `Permissions-Policy`, `Strict-Transport-Security`.
- [ ] RLS aktif untuk semua tabel (sudah default di migration init).
- [ ] Service-role key tidak ada di kode kit klien — `lib/supabase/admin.ts`
      memuat `"server-only"` import, jika tidak sengaja terimpor klien
      build akan gagal.
- [ ] `npm run lint` & `npm run build` lulus di CI sebelum merge ke `main`.
- [ ] Backup otomatis aktif di Supabase (Pro plan / setting Daily Backup).

## 8. Rollback

- **App**: Vercel menyimpan setiap deploy. Buka Deployments → klik commit
  sebelumnya → **Promote to Production**.
- **Database**: setiap migration commit punya hash; rollback berarti
  membuat migration baru yang membatalkan perubahan terakhir, lalu
  `db push`. JANGAN reset DB di production.

## 9. Monitoring (rekomendasi)

- **Logs**: Vercel Logs untuk runtime + Supabase Logs untuk Postgres &
  Auth events.
- **Performance**: Vercel Web Analytics (built-in).
- **Error tracking** (opsional): Sentry — wrap `error.tsx` boundary kita
  untuk kirim event.
