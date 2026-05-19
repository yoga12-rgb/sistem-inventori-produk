import Link from "next/link";
import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SaleForm } from "./sale-form";
import { SaleSuccessToast } from "./sale-success-toast";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Penjualan — Sistem Inventaris" };

type SaleRow = {
  id: string;
  occurred_at: string;
  notes: string | null;
  location: { code: string; name: string } | null;
  items: { quantity: number; product: { name: string; unit: string } | null }[];
  created_by: { full_name: string } | null;
};

type SearchParams = Promise<{ ok?: string }>;

export default async function PenjualanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const isAdmin = me.profile?.role === "super_admin";

  const supabase = await createSupabaseServerClient();
  const [{ data: locsData }, { data: productsData }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, code, name, type")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("products")
      .select(
        "id, sku, name, unit, is_perishable, expiry_warning_hours, expiry_discount_percent",
      )
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const locations = locsData ?? [];
  const products = productsData ?? [];
  const myOutletId = me.profile?.outlet_id ?? null;

  // Outlet yang boleh dipilih sebagai lokasi penjualan.
  const allowedOutlets = isAdmin
    ? locations.filter((l) => l.type === "outlet")
    : locations.filter((l) => l.id === myOutletId);

  // Riwayat 20 transaksi terakhir untuk konteks.
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
    .order("occurred_at", { ascending: false })
    .limit(20);
  const sales = (salesData ?? []) as unknown as SaleRow[];

  if (allowedOutlets.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Operasional
          </p>
          <h1 className="text-2xl font-semibold">Penjualan</h1>
        </header>
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Operasional
          </p>
          <h1 className="text-2xl font-semibold">Penjualan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catat transaksi multi-item. Stok dipotong otomatis FIFO; pilih
            batch tertentu jika perlu override.
          </p>
        </div>
        <Link
          href="/eod"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <Receipt className="h-4 w-4" />
          End of Day
        </Link>
      </header>

      {sp.ok ? <SaleSuccessToast /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Catat transaksi</CardTitle>
        </CardHeader>
        <CardContent>
          <SaleForm
            outlets={allowedOutlets}
            products={products}
            defaultOutletId={defaultOutletId}
          />
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-base font-semibold">Riwayat terbaru</h2>
          <span className="text-xs text-muted-foreground">
            20 transaksi terakhir
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty total</TableHead>
              <TableHead>Kasir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Belum ada transaksi.
                </TableCell>
              </TableRow>
            ) : (
              sales.map((s) => {
                const total = s.items.reduce(
                  (sum, i) => sum + Number(i.quantity),
                  0,
                );
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      {formatDateTime(s.occurred_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{s.location?.name ?? "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {s.location?.code}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.items
                        .map(
                          (i) =>
                            `${i.product?.name ?? "?"} × ${formatNumber(Number(i.quantity))}`,
                        )
                        .join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(total)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.created_by?.full_name ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
