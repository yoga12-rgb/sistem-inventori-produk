# AI Agent Instruction: Multi-Outlet Inventory System

## 1. Project Context
You are an expert full-stack developer assisting in building a fast, tablet-optimized, SPA-like Multi-Outlet Inventory and POS system.
The system relies on real-time data sync, batch tracking based on production dates, and role-based access.

## 2. Tech Stack & Tools
- **Frontend:** Next.js **16** (App Router), React **19.2**.
- **Backend & DB:** Supabase (Auth, PostgreSQL, Realtime WebSockets).
- **Deployment:** Vercel.
- **Styling & UI:** Tailwind **v4**, utility-first components (Shadcn-style). MUST support Dark Mode. Primary accent color is ORANGE.
- **Form & Validation:** React Hook Form + Zod.

## 3. Strict Development Rules

1. **Read Next.js 16 docs first.** Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`. APIs differ from older training data:
   - `cookies()`, `headers()`, `params`, `searchParams` are **async** â€” always `await`.
   - `middleware.ts` is renamed to `proxy.ts`; the exported function is `proxy`. No edge runtime.
   - Turbopack is the default for `dev` and `build`; do NOT add `--turbopack` flags.
   - Tailwind v4: configure via `@theme inline { â€¦ }` in CSS, NOT `tailwind.config.js`.
2. **Always Update Documentation:** Every time you add a new feature, modify database logic, or alter the UI, you MUST update the corresponding file under `docs/` and (if scope changes) `PRD.md` in the SAME change set.
3. **Local-First Database:** All database schema changes MUST be done through Supabase CLI migrations (`npx supabase migration new`). DO NOT execute manual SQL on the cloud dashboard.
4. **Performance Optimization:**
   - Ensure SPA-like fast navigation via `next/link` prefetch.
   - Use LocalStorage / SessionStorage for non-sensitive UI state caching (e.g. Inventory Matrix filters under key `inventory-matrix:filters`).
   - Database indexing for: `outlet_id`/`location_id`, `sku`, and `produced_at` (production_date). A partial index covers FIFO (`product_id, location_id, produced_at` where `remaining_qty > 0`).
5. **UI/UX Guidelines:**
   - Optimize for Tablets first (Cashiers); responsive for Laptops (Super Admin).
   - Accent color is ORANGE (CSS var `--primary`).
   - Implement interactive tables: hover states for batch dates/transfer info, click events for detail modals.
6. **Realtime Data:** Use Supabase Realtime (already enabled on the relevant tables) to reflect inventory and sales changes instantly.
7. **Security:**
   - Never bypass RLS â€” write Postgres functions as `security invoker` unless an explicit reason calls for `definer`.
   - Treat `SUPABASE_SERVICE_ROLE_KEY` as server-only; never expose to the browser.

## 4. Key Business Logic to Remember

- **Roles:** Super Admin (full access) vs. Cashier (limited to their `outlet_id` for transfers/sales, but can view all).
- **Catalog & Variants:** Centralized master catalog. Each variant is an independent product with its own SKU.
- **Production:** Only the Central Pastry produces new batches. Outlets receive stock via transfer.
- **Perishable vs Non-Perishable Items:** The product schema includes `is_perishable`.
  - `true` (food): track exact production date/time. Compute expiration from `default_shelf_life_hours` (per-batch override allowed). Trigger persistent UI warnings and surface the configured discount percent when approaching expiration.
  - `false` (packaging, boxes): expiration logic is bypassed. Track stock based on entry date with no shelf-life enforcement.
- **Stock Deduction (FIFO + Manual Override):** For sales, damages, expired, adjustments-minus (NOT transfers), automatically deduct from the oldest available batch (FIFO). The UI MUST provide a clear manual override option for the cashier to pick a specific batch.
- **Transfers:** Two modes â€” `two_way` (requires receiver confirmation) and `one_way` (instant). Destination batches inherit `produced_at` and `expires_at` from the source batch.
- **Sales:** No price, no payment method, no tax. Just product + qty (+ optional override batch). Multiple items per transaction.
- **WhatsApp Integration:** Cashiers generate an EOD text report (date, sold qty per product, closing stock per product with per-batch breakdown by date) and trigger sharing via `https://wa.me/?text=<encoded>` so the cashier picks the contact.
