"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Location = {
  id: string;
  code: string;
  name: string;
};

type Row = {
  id: string;
  occurred_at: string;
  quantity: number;
  notes: string | null;
  batch: { produced_at: string; expires_at: string | null } | null;
  product: {
    sku: string;
    name: string;
    unit: string;
    is_perishable: boolean;
  } | null;
  location: { id: string; code: string; name: string } | null;
  actor: { full_name: string } | null;
};

const FILTER_KEY = "production-history:filters";
const TZ = "Asia/Jakarta";

type FilterState = { locationId: string | "all" };

function readSavedFilter(): FilterState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.locationId === "string") return parsed as FilterState;
  } catch {
    /* ignore */
  }
  return null;
}

function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  base.setDate(base.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

function formatHumanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Hitung rentang [start, end) UTC untuk suatu tanggal lokal Asia/Jakarta.
 * Kita pakai offset string `+07:00` agar Postgres menerima literal tanpa
 * ambiguitas DST (Indonesia memang tidak DST, tapi format ini eksplisit).
 */
function dayRangeIso(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+07:00`);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: start.toISOString(), end: next.toISOString() };
}

export function ProductionHistory({
  centralKitchens,
  defaultLocationId,
  active = true,
}: {
  centralKitchens: Location[];
  defaultLocationId: string | null;
  /**
   * Saat false (mis. tab tidak aktif), komponen tidak melakukan fetch
   * maupun subscribe realtime — menghemat bandwidth Supabase.
   */
  active?: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [date, setDate] = useState<string>(todayLocalIso());
  const [locationId, setLocationId] = useState<string | "all">(
    () =>
      readSavedFilter()?.locationId ??
      defaultLocationId ??
      (centralKitchens.length === 1 ? centralKitchens[0].id : "all"),
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      FILTER_KEY,
      JSON.stringify({ locationId } satisfies FilterState),
    );
  }, [locationId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStale(false);
    const { start, end } = dayRangeIso(date);
    let query = supabase
      .from("stock_movements")
      .select(
        `
          id, occurred_at, quantity, notes,
          batch:stock_batches!stock_movements_batch_id_fkey(produced_at, expires_at),
          product:products(sku, name, unit, is_perishable),
          location:locations(id, code, name),
          actor:profiles(full_name)
        `,
      )
      .eq("movement_type", "production_in")
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: false });

    if (locationId !== "all") {
      query = query.eq("location_id", locationId);
    } else if (centralKitchens.length > 0) {
      query = query.in(
        "location_id",
        centralKitchens.map((l) => l.id),
      );
    }

    const { data, error } = await query;
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setRows(((data ?? []) as unknown as Row[]) ?? []);
    setLoading(false);
  }, [supabase, date, locationId, centralKitchens]);

  // Fetch hanya saat tab aktif. Saat tab di-non-aktifkan, kita berhenti
  // memuat ulang.
  useEffect(() => {
    if (!active) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    void refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [active, refresh]);

  // Realtime: subscribe HANYA saat tab aktif. Filter di server-side
  // (movement_type=production_in) supaya event lain tidak ditarik.
  // Refetch di-debounce 500ms supaya insert beruntun (mis. multi-batch
  // produksi) hanya memicu satu request.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Tandai stale, refetch ringan tanpa loading spinner penuh.
        setStale(true);
        void refresh();
      }, 500);
    };

    const channel = supabase
      .channel("production-history")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stock_movements",
          filter: "movement_type=eq.production_in",
        },
        debouncedRefetch,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, active, refresh]);

  const totalQty = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  const productCount = new Set(
    rows.map((r) => r.product?.sku).filter(Boolean),
  ).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Hari sebelumnya"
            onClick={() => setDate((d) => shiftDate(d, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Tanggal
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.currentTarget.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-base"
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Hari berikutnya"
            onClick={() => setDate((d) => shiftDate(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDate(todayLocalIso())}
          >
            Hari ini
          </Button>
        </div>

        {centralKitchens.length > 1 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Lokasi
            </span>
            <Select
              value={locationId}
              onChange={(e) =>
                setLocationId(e.currentTarget.value as string | "all")
              }
              className="min-w-60"
            >
              <option value="all">Semua Central Pastry</option>
              {centralKitchens.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw
            className={cn(
              "h-4 w-4",
              (loading || stale) && "animate-spin",
            )}
          />
          {stale ? "Sinkron…" : "Muat ulang"}
        </Button>

        <p className="ml-auto text-xs text-muted-foreground">
          {formatHumanDate(date)} · TZ {TZ}
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead>Lokasi</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Kedaluwarsa</TableHead>
              <TableHead>Aktor</TableHead>
              <TableHead>Catatan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10">
                  <EmptyState
                    title="Belum ada produksi"
                    description="Tidak ada batch yang diproduksi pada filter ini. Coba tanggal lain atau ganti lokasi."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(r.occurred_at)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.product?.name ?? "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.product?.sku}
                      {r.product?.is_perishable ? (
                        <Badge
                          variant="warning"
                          className="ml-2 align-middle"
                        >
                          Perishable
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.location ? (
                      <>
                        <div>{r.location.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.location.code}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatNumber(Number(r.quantity))}{" "}
                    <span className="text-xs text-muted-foreground">
                      {r.product?.unit}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.product?.is_perishable && r.batch?.expires_at
                      ? formatDateTime(r.batch.expires_at)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.actor?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground line-clamp-1">
                    {r.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{rows.length}</strong> batch
          </span>
          <span>·</span>
          <span>
            <strong className="text-foreground">{productCount}</strong> varian
          </span>
          <span>·</span>
          <span>
            Total qty{" "}
            <strong className="text-foreground tabular-nums">
              {formatNumber(totalQty)}
            </strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}
