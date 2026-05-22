import Link from "next/link";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { RegisterPageAction } from "@/components/register-page-action";
import { PosBoard } from "./pos-board";
import type { SaleHistoryRow } from "./sale-history-panel";
import { requireUser } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Penjualan — Sistem Inventaris" };

export default async function PenjualanPage() {
  const me = await requireUser();
  const isAdmin = me.profile?.role === "super_admin";
  const myOutletId = me.profile?.outlet_id ?? null;

  // Master data dipanggil oleh `(app)/layout.tsx` dan disebar via
  // MasterDataProvider — namun kita tetap perlu daftar outlet yang ALLOWED
  // untuk user ini di sini (server) supaya bisa render EmptyState yang tepat.
  // Pemanggilan `getMasterData()` ke layout & page sama-sama di RSC, di-dedupe
  // oleh React cache otomatis dalam 1 request.
  const { locations } = await getMasterData();

  // Outlet yang boleh dipilih sebagai lokasi penjualan.
  const allowedOutlets = isAdmin
    ? locations.filter((l) => l.type === "outlet")
    : locations.filter((l) => l.id === myOutletId);

  // Riwayat hari ini (Asia/Jakarta) — cache awal untuk panel Riwayat supaya
  // tab pertama dibuka tetap instan; panel sendiri punya filter tanggal.
  const supabase = await createSupabaseServerClient();
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
        id, occurred_at, notes, voided_at, voided_by, void_reason,
        created_by_id:created_by,
        location:locations(id, code, name),
        items:sale_items(quantity, product:products(name, unit)),
        created_by:profiles!sales_created_by_fkey(full_name)
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
        allowedOutletIds={allowedOutlets.map((o) => o.id)}
        defaultOutletId={defaultOutletId}
        history={sales}
        currentUserId={me.id}
        isAdmin={isAdmin}
        myOutletId={myOutletId}
      />
    </div>
  );
}
