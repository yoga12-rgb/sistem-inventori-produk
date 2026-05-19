# Dokumentasi — Sistem Inventaris Multi-Outlet

Selamat datang. Folder ini berisi seluruh dokumentasi teknis proyek.
File ini wajib di-update setiap kali ada perubahan fitur, skema, atau UI.

## Daftar Isi

| Dokumen | Isi |
|---|---|
| [`architecture.md`](./architecture.md) | Arsitektur aplikasi (Next.js 16, Supabase, RLS, Realtime). |
| [`database.md`](./database.md) | Skema database, indeks, trigger, kebijakan RLS, migrasi. |
| [`business-logic.md`](./business-logic.md) | Aturan FIFO, transfer, perishable, EOD, dll. |
| [`development.md`](./development.md) | Setup lokal Next.js + Supabase CLI + Docker. |
| [`deployment.md`](./deployment.md) | Deploy ke Vercel + Supabase Cloud. |
| [`roadmap.md`](./roadmap.md) | Roadmap fitur per iterasi. |

## Prinsip dokumentasi

1. **Selalu di-update**: setiap perubahan fitur, logika DB, atau UI ⇒ ubah dokumen yang relevan pada PR yang sama.
2. **Bahasa Indonesia** untuk dokumentasi tingkat produk; istilah teknis tetap Inggris jika lebih jelas.
3. **Jangan duplikasi PRD**. PRD ada di `../PRD.md`. Dokumen di sini fokus ke implementasi & how-to.
