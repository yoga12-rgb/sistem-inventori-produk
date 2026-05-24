"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type CellKind =
  | "in"
  | "out"
  | "sold"
  | "transfer_in"
  | "transfer_out"
  | "produced"
  | "entered"
  | "expired"
  | "damage"
  | "compliment"
  | "tester"
  | "adjustment_in"
  | "adjustment_out";

const KIND_LABEL: Record<CellKind, string> = {
  in: "Stok masuk",
  out: "Stok keluar (buang)",
  sold: "Penjualan",
  transfer_in: "Oper masuk",
  transfer_out: "Oper keluar",
  produced: "Produksi",
  entered: "Stok masuk (non-perishable)",
  expired: "Expired",
  damage: "Rusak",
  compliment: "Compliment",
  tester: "Tester",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
};

const MOVEMENT_LABEL: Record<string, string> = {
  production_in: "Produksi",
  entry_in: "Stok masuk",
  transfer_in: "Oper in",
  transfer_out: "Oper out",
  sale_out: "Penjualan",
  expired_out: "Expired",
  damage_out: "Rusak",
  compliment_out: "Compliment",
  tester_out: "Tester",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
};

type DetailRow = {
  movement_id: string;
  occurred_at: string;
  movement_type: string;
  quantity: number;
  batch_id: string | null;
  produced_at: string | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  actor_name: string | null;
};

export function CellDrilldown({
  productId,
  locationId,
  date,
  kind,
  productName,
  locationLabel,
  children,
  breakdown,
  filterKinds,
}: {
  productId: string;
  locationId: string;
  date: string;
  kind: CellKind;
  productName: string;
  locationLabel: string;
  children: (open: () => void) => React.ReactNode;
  breakdown?: { label: string; value: number }[];
  filterKinds?: CellKind[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<CellKind>(kind);
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset kind aktif saat modal dibuka.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setActiveKind(kind);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, kind]);

  // Fetch detail untuk activeKind setiap modal terbuka / kind berganti.
  useEffect(() => {
    if (!open) return;
    let active = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setError(null);
    void supabase
      .rpc("fn_inventory_matrix_cell", {
        p_product_id: productId,
        p_location_id: locationId,
        p_date: date,
        p_kind: activeKind,
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setRows(((data ?? []) as DetailRow[]) ?? []);
        setLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      active = false;
    };
  }, [open, supabase, productId, locationId, date, activeKind]);

  return (
    <>
      {children(() => setOpen(true))}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`${KIND_LABEL[kind]} — ${productName}`}
        description={`${locationLabel} · ${date}`}
        className="max-w-3xl"
      >
      {breakdown && breakdown.some((b) => b.value > 0) ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {breakdown.map((b) => (
            <div
              key={b.label}
              className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {b.label}
              </div>
              <div className="font-medium tabular-nums">{formatNumber(b.value)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {filterKinds && filterKinds.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveKind(kind)}
            className={chipClass(activeKind === kind)}
          >
            Semua
          </button>
          {filterKinds.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setActiveKind(k)}
              className={chipClass(activeKind === k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tidak ada movement pada filter ini.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Aktor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.movement_id}>
                  <TableCell className="text-sm">
                    {formatDateTime(m.occurred_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatNumber(Number(m.quantity))}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.produced_at
                      ? `Produksi ${formatDateTime(m.produced_at)}`
                      : "—"}
                    {m.notes ? (
                      <div className="mt-0.5 line-clamp-1">{m.notes}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.actor_name ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </Modal>
    </>
  );
}

function chipClass(active: boolean): string {
  return [
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  ].join(" ");
}
