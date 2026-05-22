import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
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
import { TransferListFilters } from "./list-filters";
import { TransferBoxTabs, type BoxKey } from "./box-tabs";
import { RegisterPageAction } from "@/components/register-page-action";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  transferModeLabel,
  transferStatusLabel,
  transferStatusVariant,
  type TransferMode,
  type TransferStatus,
} from "@/lib/transfer";

export const metadata = { title: "Transfer — Sistem Inventaris" };

type Row = {
  id: string;
  code: string;
  mode: TransferMode;
  status: TransferStatus;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  from_location: { id: string; code: string; name: string } | null;
  to_location: { id: string; code: string; name: string } | null;
  items: { quantity: number }[];
};

type SearchParams = Promise<{
  status?: string;
  outlet?: string;
  box?: string;
}>;

const ACTIVE_STATUSES: TransferStatus[] = ["pending", "in_transit"];

export default async function TransferListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const myOutlet = me.profile?.outlet_id ?? null;
  const isAdmin = me.profile?.role === "super_admin";

  // Default tab: kasir → "incoming"; admin → "all".
  const box: BoxKey =
    sp.box === "incoming" ||
    sp.box === "outgoing" ||
    sp.box === "history" ||
    sp.box === "all"
      ? sp.box
      : isAdmin
        ? "all"
        : "incoming";

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("transfers")
    .select(
      `
        id, code, mode, status, notes,
        created_at, shipped_at, received_at,
        from_location:locations!transfers_from_location_id_fkey(id, code, name),
        to_location:locations!transfers_to_location_id_fkey(id, code, name),
        items:transfer_items(quantity)
      `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // Filter berdasarkan tab.
  if (box === "incoming" && myOutlet) {
    query = query.eq("to_location_id", myOutlet).in("status", ACTIVE_STATUSES);
  } else if (box === "outgoing" && myOutlet) {
    query = query
      .eq("from_location_id", myOutlet)
      .in("status", ACTIVE_STATUSES);
  } else if (box === "history") {
    query = query.in("status", ["received", "rejected", "cancelled"]);
    if (myOutlet && !isAdmin) {
      query = query.or(
        `from_location_id.eq.${myOutlet},to_location_id.eq.${myOutlet}`,
      );
    }
  } else if (box === "all") {
    if (myOutlet && !isAdmin) {
      query = query.or(
        `from_location_id.eq.${myOutlet},to_location_id.eq.${myOutlet}`,
      );
    }
  }

  // Filter sekunder via TransferListFilters (status & outlet) — hanya
  // berlaku pada tab "all" agar tidak konflik dengan filter tab utama.
  if (box === "all") {
    if (sp.status && sp.status !== "all") {
      query = query.eq("status", sp.status);
    }
    if (sp.outlet && sp.outlet !== "all") {
      query = query.or(
        `from_location_id.eq.${sp.outlet},to_location_id.eq.${sp.outlet}`,
      );
    }
  }

  const { data, error } = await query;
  const rows = ((data ?? []) as unknown as Row[]) ?? [];

  return (
    <div className="space-y-6">
      <RegisterPageAction>
        <Link
          href="/transfer/baru"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Buat Transfer
        </Link>
      </RegisterPageAction>

      <TransferBoxTabs current={box} canHaveOutletBoxes={!!myOutlet} />

      {box === "all" ? (
        <TransferListFilters defaultOutletId={myOutlet} />
      ) : null}

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Asal → Tujuan</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Item</TableHead>
              <TableHead>Dibuat</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10">
                  <EmptyState
                    icon={ArrowLeftRight}
                    title={
                      box === "incoming"
                        ? "Tidak ada transfer masuk"
                        : box === "outgoing"
                          ? "Tidak ada transfer keluar"
                          : box === "history"
                            ? "Belum ada riwayat"
                            : "Belum ada transfer"
                    }
                    description={
                      box === "incoming"
                        ? "Tidak ada transfer pending atau dalam perjalanan ke outlet ini."
                        : box === "outgoing"
                          ? "Tidak ada transfer pending atau dalam perjalanan dari outlet ini."
                          : "Buat transfer pertama dari Central Pastry ke outlet."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const totalQty = r.items.reduce(
                  (sum, i) => sum + Number(i.quantity),
                  0,
                );
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.code}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">
                          {r.from_location?.code ?? "—"}
                        </span>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span className="font-medium">
                          {r.to_location?.code ?? "—"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.from_location?.name} → {r.to_location?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {transferModeLabel(r.mode)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={transferStatusVariant(r.status)}>
                        {transferStatusLabel(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.items.length}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({totalQty})
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/transfer/${r.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Detail
                      </Link>
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
