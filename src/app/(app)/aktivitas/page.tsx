import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Aktivitas — Sistem Inventaris" };

const MOVEMENT_LABEL: Record<string, string> = {
  production_in: "Produksi",
  entry_in: "Stok masuk",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  sale_out: "Penjualan",
  expired_out: "Expired",
  damage_out: "Rusak",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
};

const IN_TYPES = new Set([
  "production_in",
  "entry_in",
  "transfer_in",
  "adjustment_in",
]);

type Movement = {
  id: string;
  occurred_at: string;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  notes: string | null;
  product: { sku: string; name: string; unit: string } | null;
  location: { code: string; name: string } | null;
  actor: { full_name: string } | null;
};

type SearchParams = Promise<{ type?: string; outlet?: string }>;

export default async function AktivitasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("stock_movements")
    .select(
      `
        id, occurred_at, movement_type, quantity, reference_type, notes,
        product:products(sku, name, unit),
        location:locations(code, name),
        actor:profiles(full_name)
      `,
    )
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (sp.type && sp.type !== "all") {
    query = query.eq("movement_type", sp.type);
  }
  if (sp.outlet && sp.outlet !== "all") {
    query = query.eq("location_id", sp.outlet);
  }

  const { data, error } = await query;
  const rows = ((data ?? []) as unknown as Movement[]) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Audit
        </p>
        <h1 className="text-2xl font-semibold">Aktivitas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          200 movement stok terbaru. Semua transaksi tercatat — termasuk
          adjustment dari pembatalan transfer.
        </p>
      </header>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Belum ada aktivitas"
          description="Aktivitas akan muncul saat Anda mencatat produksi, transfer, atau penjualan."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Aktor</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const isIn = IN_TYPES.has(m.movement_type);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {formatDateTime(m.occurred_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isIn ? "success" : "outline"}>
                        {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {m.product?.name ?? "—"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {m.product?.sku}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.location?.code ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={isIn ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {isIn ? "+" : "−"}
                        {formatNumber(Number(m.quantity))}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {m.product?.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.actor?.full_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                      {m.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
