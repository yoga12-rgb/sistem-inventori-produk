"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMasterData } from "@/components/master-data-provider";
import { cn } from "@/lib/utils";
import { CellDrilldown, type CellKind } from "./cell-drilldown";

type Location = {
  id: string;
  code: string;
  name: string;
  type: "central_kitchen" | "outlet";
};

type MatrixRow = {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  is_perishable: boolean;
  location_id: string;
  location_code: string;
  location_name: string;
  opening: number;
  produced_in: number;
  entered_in: number;
  transfer_in: number;
  transfer_out: number;
  sold: number;
  expired_out: number;
  damage_out: number;
  compliment_out: number;
  tester_out: number;
  adjustment_in: number;
  adjustment_out: number;
  closing: number;
};

const FILTER_KEY = "inventory-matrix:filters";
const ESTIMATED_ROW_HEIGHT = 69;
const MIN_PAGE_SIZE = 8;
const OVERSCAN_ROWS = 4;
const stickyHeadClass =
  "sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]";

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
  const base = new Date(y, (m ?? 1) - 1, d ?? 1);
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
 * Cycle filter lokasi: "all" → semua lokasi (urut sesuai array) → "all".
 * Saat outlet kosong, tetap return "all" (no-op).
 */
function cycleLocation(
  locations: Location[],
  current: string | "all",
  direction: -1 | 1,
): string | "all" {
  if (locations.length === 0) return "all";
  // Urutan siklus: ["all", ...locations[].id]
  const ids: Array<string | "all"> = ["all", ...locations.map((l) => l.id)];
  const idx = ids.indexOf(current);
  const nextIdx = idx === -1 ? 0 : (idx + direction + ids.length) % ids.length;
  return ids[nextIdx];
}

export function MatrixBoard({
  defaultLocationId,
}: {
  defaultLocationId: string | null;
}) {
  // Locations dari provider — tidak fetch ulang per navigasi.
  const { locations } = useMasterData();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [date, setDate] = useState<string>(todayLocalIso());
  const [locationId, setLocationId] = useState<string | "all">(
    () => readSavedFilter()?.locationId ?? defaultLocationId ?? "all",
  );
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Persist filter lokasi.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      FILTER_KEY,
      JSON.stringify({ locationId } satisfies FilterState),
    );
  }, [locationId]);

  const fetchRows = useCallback(
    async (from: number, limit: number) => {
      const to = from + limit - 1;
      return await supabase
        .rpc("fn_inventory_matrix", {
          p_date: date,
          p_location_id: locationId === "all" ? null : locationId,
        })
        .range(from, to);
    },
    [date, locationId, supabase],
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

        const { data, error } = await fetchRows(0, pageSize);
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        const nextRows = ((data ?? []) as MatrixRow[]) ?? [];
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

    const { data, error } = await fetchRows(rows.length, pageSize);
    if (error) {
      setError(error.message);
      setLoadingMore(false);
      return;
    }

    const nextRows = ((data ?? []) as MatrixRow[]) ?? [];
    setRows((prev) => [...prev, ...nextRows]);
    setHasMore(nextRows.length === pageSize);
    setLoadingMore(false);
  }, [fetchRows, hasMore, loading, loadingMore, pageSize, rows.length]);

  const refresh = useCallback(async () => {
    if (pageSize === null) return;
    setLoading(true);
    setRows([]);
    setHasMore(true);
    setError(null);

    const { data, error } = await fetchRows(0, pageSize);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const nextRows = ((data ?? []) as MatrixRow[]) ?? [];
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

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[26rem] flex-col gap-4 lg:h-[calc(100dvh-8rem)]">
      <div className="sticky top-0 z-20 flex flex-shrink-0 flex-wrap items-end gap-3 bg-background pb-2">
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

        <div className="flex items-end gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Lokasi sebelumnya"
            onClick={() =>
              setLocationId((cur) => cycleLocation(locations, cur, -1))
            }
            disabled={locations.length === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
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
              <option value="all">Semua lokasi</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}{" "}
                  {l.type === "central_kitchen" ? "(CP)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Lokasi berikutnya"
            onClick={() =>
              setLocationId((cur) => cycleLocation(locations, cur, +1))
            }
            disabled={locations.length === 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocationId("all")}
            disabled={locationId === "all"}
          >
            Semua
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Muat ulang
        </Button>

        <p className="ml-auto text-xs text-muted-foreground">
          {rows.length} baris dimuat - {formatHumanDate(date)}
        </p>
      </div>

      {error ? (
        <p className="flex-shrink-0 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <div ref={scrollAreaRef} className="h-full overflow-auto">
          <table className="w-full min-w-[76rem] caption-bottom text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className={stickyHeadClass}>Produk</TableHead>
                <TableHead className={stickyHeadClass}>Lokasi</TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Stok awal
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Masuk
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Transfer in
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Transfer out
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Terjual
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Expired
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Compliment
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Tester
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Rusak
                </TableHead>
                <TableHead className={cn(stickyHeadClass, "text-right")}>
                  Stok akhir
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: MIN_PAGE_SIZE }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={12} className="py-4">
                      <div className="h-5 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-10">
                    <EmptyState
                      title="Tidak ada aktivitas"
                      description="Belum ada stok atau movement untuk filter ini. Coba tanggal lain atau lokasi lain."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                const incoming = r.produced_in + r.entered_in + r.adjustment_in;
                const locationLabel = `${r.location_code} - ${r.location_name}`;
                return (
                  <TableRow key={`${r.product_id}-${r.location_id}`}>
                    <TableCell>
                      <div className="font-medium">{r.product_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.sku}
                        {r.is_perishable ? (
                          <Badge variant="warning" className="ml-2 align-middle">
                            Perishable
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{r.location_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.location_code}
                      </div>
                    </TableCell>

                    <CellNumeric
                      value={r.opening}
                      unit={r.unit}
                      muted
                    />
                    <Cell
                      value={incoming}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="in"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                      breakdown={[
                        { label: "Produksi", value: r.produced_in },
                        { label: "Stok masuk", value: r.entered_in },
                        { label: "Adjustment in", value: r.adjustment_in },
                      ]}
                    />
                    <Cell
                      value={r.transfer_in}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="transfer_in"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                    />
                    <Cell
                      value={r.transfer_out}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="transfer_out"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                    />
                    <Cell
                      value={r.sold}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="sold"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                    />
                    <Cell
                      value={r.expired_out}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="expired"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                    />
                    <Cell
                      value={r.compliment_out}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="compliment"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                    />
                    <Cell
                      value={r.tester_out}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="tester"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                    />
                    <Cell
                      value={r.damage_out}
                      unit={r.unit}
                      productId={r.product_id}
                      locationId={r.location_id}
                      date={date}
                      kind="damage"
                      productName={r.product_name}
                      locationLabel={locationLabel}
                    />
                    <CellNumeric
                      value={r.closing}
                      unit={r.unit}
                      strong
                    />
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
                ? "Memuat baris berikutnya..."
                : hasMore
                  ? "Gulir tabel untuk memuat lagi"
                  : "Semua data sudah dimuat"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CellNumeric({
  value,
  unit,
  muted,
  strong,
}: {
  value: number;
  unit: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <TableCell className={cn(
      "text-right tabular-nums",
      muted && "text-muted-foreground",
      strong && "font-medium",
    )}>
      {formatNumber(value)} <span className="text-xs text-muted-foreground">{unit}</span>
    </TableCell>
  );
}

function Cell({
  value,
  unit,
  productId,
  locationId,
  date,
  kind,
  productName,
  locationLabel,
  breakdown,
  filterKinds,
}: {
  value: number;
  unit: string;
  productId: string;
  locationId: string;
  date: string;
  kind: CellKind;
  productName: string;
  locationLabel: string;
  breakdown?: { label: string; value: number }[];
  filterKinds?: CellKind[];
}) {
  if (value === 0) {
    return (
      <TableCell className="text-right tabular-nums text-muted-foreground">
        —
      </TableCell>
    );
  }

  return (
    <TableCell className="text-right tabular-nums">
      <CellDrilldown
        productId={productId}
        locationId={locationId}
        date={date}
        kind={kind}
        productName={productName}
        locationLabel={locationLabel}
        breakdown={breakdown}
        filterKinds={filterKinds}
      >
        {(open) => (
          <button
            type="button"
            onClick={open}
            className="rounded-md px-1.5 py-0.5 font-medium tabular-nums hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Klik untuk melihat detail"
          >
            {formatNumber(value)}{" "}
            <span className="text-xs text-muted-foreground">{unit}</span>
          </button>
        )}
      </CellDrilldown>
    </TableCell>
  );
}
