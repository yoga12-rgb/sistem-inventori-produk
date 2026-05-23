"use client";

import { Activity, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMasterData } from "@/components/master-data-provider";
import { formatDateTime } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ESTIMATED_ROW_HEIGHT = 61;
const MIN_PAGE_SIZE = 8;
const OVERSCAN_ROWS = 4;

const INTEGER_QTY_FMT = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

const MOVEMENT_LABEL: Record<string, string> = {
  production_in: "Produksi",
  entry_in: "Stok masuk",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  transfer_loss: "Susut transfer",
  sale_out: "Penjualan",
  sale_void: "Void penjualan",
  expired_out: "Expired",
  damage_out: "Rusak",
  compliment_out: "Compliment",
  tester_out: "Tester",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
};

const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABEL);

const IN_TYPES = new Set([
  "production_in",
  "entry_in",
  "transfer_in",
  "sale_void",
  "adjustment_in",
]);

const stickyHeadClass =
  "sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]";

type Movement = {
  id: string;
  occurred_at: string;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  notes: string | null;
  product: { sku: string; name: string; unit: string } | null;
  location: { id: string; code: string; name: string } | null;
  actor: { full_name: string } | null;
};

function formatMovementQty(value: number): string {
  if (!Number.isFinite(value)) return "Tidak valid";
  if (!Number.isInteger(value)) return `Tidak valid (${value})`;
  return INTEGER_QTY_FMT.format(value);
}

function formatMovementNote(m: Movement): string {
  if (!m.notes) return "-";
  if (m.reference_type !== "production_edit") return m.notes;

  return m.notes.replace(/\b(\d+)\.0+\b/g, "$1");
}

function safeType(value: string | null): string {
  if (!value || value === "all") return "all";
  return MOVEMENT_TYPES.includes(value) ? value : "all";
}

function safeOutlet(value: string | null, locationIds: Set<string>): string {
  if (!value || value === "all") return "all";
  return locationIds.has(value) ? value : "all";
}

function safeDate(value: string | null): string {
  if (!value) return "all";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "all";
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isFinite(date.getTime()) ? value : "all";
}

function dayRangeIso(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function AktivitasBoard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locations } = useMasterData();
  const locationIds = useMemo(
    () => new Set(locations.map((l) => l.id)),
    [locations],
  );

  const type = safeType(searchParams.get("type"));
  const outlet = safeOutlet(searchParams.get("outlet"), locationIds);
  const date = safeDate(searchParams.get("date"));

  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const updateFilter = (key: "type" | "outlet" | "date", value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const resetFilters = () => {
    router.replace(pathname);
  };

  const fetchRows = useCallback(
    async (from: number, limit: number) => {
      const to = from + limit - 1;
      let query = supabase
        .from("stock_movements")
        .select(
          `
            id, occurred_at, movement_type, quantity, reference_type, notes,
            product:products(sku, name, unit),
            location:locations(id, code, name),
            actor:profiles(full_name)
          `,
        )
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (type !== "all") query = query.eq("movement_type", type);
      if (outlet !== "all") query = query.eq("location_id", outlet);
      if (date !== "all") {
        const range = dayRangeIso(date);
        query = query.gte("occurred_at", range.start).lt("occurred_at", range.end);
      }

      return await query;
    },
    [date, outlet, supabase, type],
  );

  useEffect(() => {
    const node = scrollAreaRef.current;
    if (!node) return;

    let frame: number | null = null;
    const measure = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const visibleRows = Math.ceil(node.clientHeight / ESTIMATED_ROW_HEIGHT);
        const next = Math.max(MIN_PAGE_SIZE, visibleRows + OVERSCAN_ROWS);
        setPageSize((prev) => (prev === next ? prev : next));
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(node);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (pageSize === null) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setRows([]);
        setHasMore(true);
        setError(null);

        const { data, error: queryError } = await fetchRows(0, pageSize);
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          setLoading(false);
          return;
        }

        const nextRows = (data ?? []) as unknown as Movement[];
        setRows(nextRows);
        setHasMore(nextRows.length === pageSize);
        setLoading(false);
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchRows, pageSize]);

  const loadMore = useCallback(async () => {
    if (pageSize === null || loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    setError(null);

    const { data, error: queryError } = await fetchRows(rows.length, pageSize);
    if (queryError) {
      setError(queryError.message);
      setLoadingMore(false);
      return;
    }

    const nextRows = (data ?? []) as unknown as Movement[];
    setRows((prev) => [...prev, ...nextRows]);
    setHasMore(nextRows.length === pageSize);
    setLoadingMore(false);
  }, [fetchRows, hasMore, loading, loadingMore, pageSize, rows.length]);

  const reload = useCallback(async () => {
    if (pageSize === null) return;

    setLoading(true);
    setRows([]);
    setHasMore(true);
    setError(null);

    const { data, error: queryError } = await fetchRows(0, pageSize);
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const nextRows = (data ?? []) as unknown as Movement[];
    setRows(nextRows);
    setHasMore(nextRows.length === pageSize);
    setLoading(false);
  }, [fetchRows, pageSize]);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = scrollAreaRef.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { root, rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const activeFilterCount =
    (type !== "all" ? 1 : 0) +
    (outlet !== "all" ? 1 : 0) +
    (date !== "all" ? 1 : 0);

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[26rem] flex-col gap-4 lg:h-[calc(100dvh-8rem)]">
      <div className="sticky top-0 z-20 flex flex-shrink-0 flex-wrap items-end gap-3 bg-background pb-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tipe</span>
          <Select
            value={type}
            onChange={(e) => updateFilter("type", e.currentTarget.value)}
            className="min-w-56"
          >
            <option value="all">Semua tipe</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_LABEL[t]}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Lokasi</span>
          <Select
            value={outlet}
            onChange={(e) => updateFilter("outlet", e.currentTarget.value)}
            className="min-w-60"
          >
            <option value="all">Semua lokasi</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} - {l.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tanggal</span>
          <Input
            type="date"
            value={date === "all" ? "" : date}
            onChange={(e) =>
              updateFilter("date", e.currentTarget.value || "all")
            }
            className="min-w-44"
          />
        </label>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Muat ulang
        </Button>

        {activeFilterCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" />
            Reset filter
          </Button>
        ) : null}

        <p className="ml-auto text-xs text-muted-foreground">
          {rows.length} aktivitas dimuat
        </p>
      </div>

      {error ? (
        <p className="flex-shrink-0 text-sm text-destructive">{error}</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="min-h-0 flex-1 rounded-xl border bg-card p-6">
          <EmptyState
            icon={Activity}
            title="Belum ada aktivitas"
            description="Aktivitas akan muncul saat Anda mencatat produksi, transfer, atau penjualan."
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
          <div ref={scrollAreaRef} className="h-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className={stickyHeadClass}>Waktu</TableHead>
                  <TableHead className={stickyHeadClass}>Tipe</TableHead>
                  <TableHead className={stickyHeadClass}>Produk</TableHead>
                  <TableHead className={stickyHeadClass}>Lokasi</TableHead>
                  <TableHead className={cn(stickyHeadClass, "text-right")}>
                    Qty
                  </TableHead>
                  <TableHead className={stickyHeadClass}>Aktor</TableHead>
                  <TableHead className={stickyHeadClass}>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7} className="py-4">
                        <div className="h-5 animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  rows.map((m) => {
                    const isIn = IN_TYPES.has(m.movement_type);
                    const quantity = Number(m.quantity);
                    const hasInvalidQty =
                      !Number.isFinite(quantity) || !Number.isInteger(quantity);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDateTime(m.occurred_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isIn ? "success" : "outline"}>
                            {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {m.product?.name ?? "-"}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {m.product?.sku}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.location?.code ?? "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={
                              hasInvalidQty
                                ? "text-destructive"
                                : isIn
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : ""
                            }
                          >
                            {hasInvalidQty ? "" : isIn ? "+" : "-"}
                            {formatMovementQty(quantity)}
                          </span>{" "}
                          <span className="text-xs text-muted-foreground">
                            {m.product?.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.actor?.full_name ?? "-"}
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground line-clamp-1">
                          {formatMovementNote(m)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </table>

            <div ref={sentinelRef} className="h-6" />
            {!loading && rows.length > 0 ? (
              <div className="flex justify-center px-3 pb-4 text-sm text-muted-foreground">
                {loadingMore
                  ? "Memuat aktivitas berikutnya..."
                  : hasMore
                    ? "Gulir tabel untuk memuat lagi"
                    : "Semua aktivitas sudah dimuat"}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
