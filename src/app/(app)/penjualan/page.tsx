import Link from "next/link";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { RegisterPageAction } from "@/components/register-page-action";
import { PosBoard, type PosProduct } from "./pos-board";
import type { SaleHistoryRow } from "./sale-history-sheet";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Penjualan — Sistem Inventaris" };

export default async function PenjualanPage() {
  const me = await requireUser();
  const isAdmin = me.profile?.role === "super_admin";

  const supabase = await createSupabaseServerClient();
  const [{ data: locsData }, { data: productsData }, { data: categoriesData }] =
    await Promise.all([
      supabase
        .from("locations")
        .select("id, code, name, type")
        .eq("is_active", true)
        .order("code", { ascending: true }),
      supabase
        .from("products")
        .select(
          `
            id, sku, name, unit, category_id,
            is_perishable, expiry_warning_hours, expiry_discount_percent,
            category:product_categories(id, name, icon, color)
          `,
        )
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("product_categories")
        .select("id, code, name, icon, color, sort")
        .eq("is_active", true)
        .order("sort", { ascending: true })
        .order("name", { ascending: true }),
    ]);

  const locations = locsData ?? [];
  const categories = categoriesData ?? [];

  // Supabase PostgREST mengembalikan join FK sebagai array. Karena
  // products.category_id adalah FK tunggal, kita flatten ke object | null.
  const products = ((productsData ?? []) as unknown as Array<Record<string, unknown>>).map(
    (p) => ({
      ...p,
      category: Array.isArray(p.category)
        ? (p.category[0] as PosProduct["category"]) ?? null
        : (p.category as PosProduct["category"]) ?? null,
    }),
  ) as unknown as PosProduct[];
  const myOutletId = me.profile?.outlet_id ?? null;

  // Outlet yang boleh dipilih sebagai lokasi penjualan.
  const allowedOutlets = isAdmin
    ? locations.filter((l) => l.type === "outlet")
    : locations.filter((l) => l.id === myOutletId);

  // Riwayat hari ini (Asia/Jakarta) — cache awal untuk sheet kanan supaya
  // buka pertama kali instan; sheet sendiri punya filter tanggal sendiri.
  const startOfTodayJakarta = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return new Date(`${iso}T00:00:00+07:00`).toISOString();
  })();
  const endOfTodayJakarta = new Date(
    new Date(startOfTodayJakarta).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: salesData } = await supabase
    .from("sales")
    .select(
      `
        id, occurred_at, notes,
        location:locations(code, name),
        items:sale_items(quantity, product:products(name, unit)),
        created_by:profiles(full_name)
      `,
    )
    .gte("occurred_at", startOfTodayJakarta)
    .lt("occurred_at", endOfTodayJakarta)
    .order("occurred_at", { ascending: false });
  const sales = (salesData ?? []) as unknown as SaleHistoryRow[];

  if (allowedOutlets.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={Receipt}
          title="Belum ada outlet untuk Anda"
          description={
            isAdmin
              ? "Buat minimal satu outlet (bukan Central Pastry)."
              : "Hubungi Super Admin untuk menugaskan outlet."
          }
        />
      </div>
    );
  }

  const defaultOutletId =
    allowedOutlets.find((l) => l.id === myOutletId)?.id ??
    allowedOutlets[0].id;

  return (
    <div className="space-y-5">
      <RegisterPageAction>
        <Link
          href="/eod"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <Receipt className="h-4 w-4" />
          End of Day
        </Link>
      </RegisterPageAction>

      <PosBoard
        outlets={allowedOutlets}
        products={products}
        categories={categories}
        defaultOutletId={defaultOutletId}
        history={sales}
      />
    </div>
  );
}
