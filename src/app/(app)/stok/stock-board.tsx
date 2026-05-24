"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  hoursBetween,
} from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMasterData } from "@/components/master-data-provider";
import { cn } from "@/lib/utils";
import { DisposalDialog } from "./disposal-dialog";

type StockRow = {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  is_perishable: boolean;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  location_id: string;
  location_code: string;
  location_name: string;
  total_qty: number;
  active_batches: number;
  nearest_expiry: string | null;
  oldest_produced_at: string | null;
};

type BatchRow = {
  id: string;
  produced_at: string;
  expires_at: string | null;
  initial_qty: number;
  remaining_qty: number;
  notes: string | null;
};

const FILTER_KEY = "stock-board:filters";
const ESTIMATED_ROW_HEIGHT = 73;
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

function cycleLocation(
  locations: Array<{ id: string }>,
  current: string | "all",
  direction: -1 | 1,
): string | "all" {
  if (locations.length === 0) return "all";
  const ids: Array<string | "all"> = ["all", ...locations.map((l) => l.id)];
  const idx = ids.indexOf(current);
  const nextIdx = idx === -1 ? 0 : (idx + direction + ids.length) % ids.length;
  return ids[nextIdx];
}

export function StockBoard() {
  // Master data dari layout provider — tidak fetch ulang per navigasi.
  const master = useMasterData();
  const locations = master.locations;
  const categories = master.categories;

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  // Init dengan server value saja — localStorage di-sync via useEffect
  // supaya tidak menyebabkan hydration mismatch (server vs client).
  const [locationId, setLocationId] = useState<string | "all">("all");

  // Sync filter dari localStorage setelah mount (client-only).
  useEffect(() => {
    const saved = readSavedFilter();
    if (!saved?.locationId) return;
    const timer = window.setTimeout(() => {
      setLocationId(saved.locationId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiredCount, setExpiredCount] = useState(0);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Persist filter.
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
      let query = supabase
        .from("v_stock_per_location")
        .select(
          "product_id, sku, product_name, unit, is_perishable, category_id, category_name, category_icon, category_color, location_id, location_code, location_name, total_qty, active_batches, nearest_expiry, oldest_produced_at",
        )
        .order("product_name", { ascending: true })
        .order("sku", { ascending: true })
        .order("location_code", { ascending: true })
        .range(from, to);

      if (locationId !== "all") query = query.eq("location_id", locationId);
      if (categoryFilter === "none") query = query.is("category_id", null);
      else if (categoryFilter !== "all") {
        query = query.eq("category_id", categoryFilter);
      }

      return await query;
    },
    [categoryFilter, locationId, supabase],
  );

  const fetchExpiredCount = useCallback(async () => {
    let query = supabase
      .from("v_stock_per_location")
      .select("product_id", { count: "exact", head: true })
      .eq("is_perishable", true)
      .lt("nearest_expiry", new Date().toISOString());

    if (locationId !== "all") query = query.eq("location_id", locationId);
    if (categoryFilter === "none") query = query.is("category_id", null);
    else if (categoryFilter !== "all") {
      query = query.eq("category_id", categoryFilter);
    }

    const { count, error } = await query;
    return error ? null : (count ?? 0);
  }, [categoryFilter, locationId, supabase]);

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
        scrollAreaRef.current?.scrollTo({ top: 0 });

        const [{ data, error }, nextExpiredCount] = await Promise.all([
          fetchRows(0, pageSize),
          fetchExpiredCount(),
        ]);
        if (cancelled) return;
        if (nextExpiredCount !== null) setExpiredCount(nextExpiredCount);
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        const nextRows = (data ?? []) as StockRow[];
        setRows(nextRows);
        setHasMore(nextRows.length === pageSize);
        setLoading(false);
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchExpiredCount, fetchRows, pageSize]);

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

    const nextRows = (data ?? []) as StockRow[];
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
    scrollAreaRef.current?.scrollTo({ top: 0 });

    const [{ data, error }, nextExpiredCount] = await Promise.all([
      fetchRows(0, pageSize),
      fetchExpiredCount(),
    ]);
    if (nextExpiredCount !== null) setExpiredCount(nextExpiredCount);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const nextRows = (data ?? []) as StockRow[];
    setRows(nextRows);
    setHasMore(nextRows.length === pageSize);
    setLoading(false);
  }, [fetchExpiredCount, fetchRows, pageSize]);

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

  // Realtime: any batch / movement change → re-fetch view.
  useEffect(() => {
    const channel = supabase
      .channel("stock-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_batches" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements" },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[26rem] flex-col gap-4 lg:h-[calc(100dvh-8rem)]">
      <div className="sticky top-0 z-20 flex flex-shrink-0 flex-col gap-3 bg-background pb-2">
        <div className="flex flex-wrap items-end gap-3">
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
          <span className="text-sm font-medium">Lokasi</span>
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
                {l.code} — {l.name} {l.type === "central_kitchen" ? "(CP)" : ""}
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
          </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Muat ulang
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          {rows.length} produk dimuat
        </p>
      </div>

      {/* Filter kategori */}
      {categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              categoryFilter === "all"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            Semua kategori
          </button>
          {categories.map((c) => {
            const active = categoryFilter === c.id;
            const style =
              active && c.color
                ? {
                    borderColor: `${c.color}80`,
                    backgroundColor: `${c.color}1f`,
                    color: c.color,
                  }
                : undefined;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? c.color
                      ? ""
                      : "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                style={style}
              >
                {c.icon ? <span>{c.icon}</span> : null}
                {c.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCategoryFilter("none")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              categoryFilter === "none"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            Tanpa kategori
          </button>
        </div>
      ) : null}
      </div>

      {error ? (
        <p className="flex-shrink-0 text-sm text-destructive">{error}</p>
      ) : null}

      {expiredCount > 0 ? (
        <div className="flex flex-shrink-0 items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">
              {expiredCount} produk aktif sudah melewati masa expired.
            </p>
            <p className="mt-0.5 text-xs text-destructive/80">
              Gunakan aksi Buang stok untuk mencatat stok expired.
            </p>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <div ref={scrollAreaRef} className="h-full overflow-auto">
          <table className="w-full min-w-[68rem] caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className={stickyHeadClass}>Produk</TableHead>
              <TableHead className={stickyHeadClass}>Kategori</TableHead>
              <TableHead className={stickyHeadClass}>Lokasi</TableHead>
              <TableHead className={cn(stickyHeadClass, "text-right")}>
                Total stok
              </TableHead>
              <TableHead className={cn(stickyHeadClass, "text-right")}>
                Batch
              </TableHead>
              <TableHead className={stickyHeadClass}>Expired terdekat</TableHead>
              <TableHead className={cn(stickyHeadClass, "text-right")}>
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: MIN_PAGE_SIZE }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7} className="py-4">
                    <div className="h-5 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10">
                  <EmptyState
                    title="Belum ada stok"
                    description="Catat produksi atau stok masuk untuk mulai mengisi inventaris."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const product = master.productById.get(r.product_id);
                const warningHours = product?.expiry_warning_hours ?? 24;
                const hoursToExpiry = r.nearest_expiry
                  ? hoursBetween(new Date(), r.nearest_expiry)
                  : null;
                const isExpired =
                  r.is_perishable &&
                  hoursToExpiry !== null &&
                  hoursToExpiry < 0;
                const isWarning =
                  r.is_perishable &&
                  !isExpired &&
                  hoursToExpiry !== null &&
                  hoursToExpiry <= warningHours;
                return (
                  <TableRow key={`${r.product_id}-${r.location_id}`}>
                    <TableCell>
                      <div className="font-medium">{r.product_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.sku}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.category_name ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                          style={
                            r.category_color
                              ? {
                                  borderColor: `${r.category_color}66`,
                                  backgroundColor: `${r.category_color}1f`,
                                  color: r.category_color,
                                }
                              : undefined
                          }
                        >
                          {r.category_icon ? (
                            <span>{r.category_icon}</span>
                          ) : null}
                          {r.category_name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.location_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.location_code}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNumber(r.total_qty)}{" "}
                      <span className="text-muted-foreground">{r.unit}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.active_batches}
                    </TableCell>
                    <TableCell>
                      {r.is_perishable ? (
                        <span className="flex items-center gap-2">
                          {isExpired || isWarning ? (
                            <AlertTriangle
                              aria-label={
                                isExpired
                                  ? "Sudah expired"
                                  : "Mendekati kedaluwarsa"
                              }
                              className={cn(
                                "h-4 w-4",
                                isExpired ? "text-destructive" : "text-warning",
                              )}
                            />
                          ) : null}
                          <span
                            className={cn(
                              "text-sm",
                              isExpired && "font-medium text-destructive",
                              isWarning &&
                                "font-medium text-warning-foreground",
                            )}
                          >
                            {formatDateTime(r.nearest_expiry)}
                          </span>
                          {isExpired ? (
                            <Badge variant="danger">Expired</Badge>
                          ) : isWarning && product?.expiry_discount_percent ? (
                            <Badge variant="warning">
                              Saran diskon{" "}
                              {Math.round(product.expiry_discount_percent)}%
                            </Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <BatchListModal
                          productId={r.product_id}
                          locationId={r.location_id}
                          productName={r.product_name}
                          locationLabel={`${r.location_code} — ${r.location_name}`}
                          unit={r.unit}
                          isPerishable={r.is_perishable}
                          warningHours={warningHours}
                        />
                        <DisposalDialog
                          productId={r.product_id}
                          locationId={r.location_id}
                          productName={r.product_name}
                          locationLabel={`${r.location_code} — ${r.location_name}`}
                          unit={r.unit}
                          isPerishable={r.is_perishable}
                        />
                      </div>
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
                ? "Memuat produk berikutnya..."
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

function BatchListModal({
  productId,
  locationId,
  productName,
  locationLabel,
  unit,
  isPerishable,
  warningHours,
}: {
  productId: string;
  locationId: string;
  productName: string;
  locationLabel: string;
  unit: string;
  isPerishable: boolean;
  warningHours: number;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bridge ke Supabase: setState di effect adalah pola data fetching standar.
  useEffect(() => {
    if (!open) return;
    let active = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setError(null);
    void supabase
      .from("stock_batches")
      .select("id, produced_at, expires_at, initial_qty, remaining_qty, notes")
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .gt("remaining_qty", 0)
      .order("produced_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setBatches((data ?? []) as BatchRow[]);
        setLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      active = false;
    };
  }, [open, supabase, productId, locationId]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Detail batch
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={productName}
        description={`Batch aktif di ${locationLabel}`}
        className="max-w-2xl"
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tidak ada batch aktif di lokasi ini.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tgl produksi</TableHead>
                  {isPerishable ? <TableHead>Expired</TableHead> : null}
                  <TableHead className="text-right">Awal</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const isWarning =
                    isPerishable &&
                    b.expires_at &&
                    hoursBetween(new Date(), b.expires_at) <= warningHours;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">
                        {formatDateTime(b.produced_at)}
                      </TableCell>
                      {isPerishable ? (
                        <TableCell
                          className={cn(
                            "text-sm",
                            isWarning && "font-medium text-warning-foreground",
                          )}
                        >
                          <span className="inline-flex items-center gap-1">
                            {isWarning ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                            ) : null}
                            {formatDate(b.expires_at)}
                          </span>
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatNumber(b.initial_qty)} {unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatNumber(b.remaining_qty)} {unit}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Modal>
    </>
  );
}
