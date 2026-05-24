"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
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
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { editProductionQtyAction, voidProductionAction } from "./actions";
import type { EditProductionState, VoidProductionState } from "./state";

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
  batch: {
    id: string;
    initial_qty: number;
    remaining_qty: number;
    produced_at: string;
    expires_at: string | null;
  } | null;
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
 */
function dayRangeIso(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+07:00`);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: start.toISOString(), end: next.toISOString() };
}

// ---------- Edit Modal ------------------------------------------------

function EditQtyModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const toast = useToast();

  const [state, formAction, pending] = useActionState<
    EditProductionState,
    FormData
  >(editProductionQtyAction, { ok: false });

  // Auto-close on success (detect transition false → true)
  const prevOkRef = useRef(state.ok);
  useEffect(() => {
    if (!prevOkRef.current && state.ok) {
      toast.success("Qty produksi berhasil diubah.");
      onClose();
    }
    prevOkRef.current = state.ok;
  }, [state.ok, onClose, toast]);

  const initialQty = row.batch?.initial_qty ?? row.quantity;

  // Jika batch sudah habis (voided/0), jangan tampilkan form edit
  if (row.batch && row.batch.remaining_qty <= 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Edit qty produksi</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Batch ini sudah tidak memiliki stok tersisa. Tidak dapat mengubah
            qty.
          </p>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit qty produksi</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {row.product?.name ?? "—"} · {row.product?.sku}
        </p>

        <form action={formAction}>
          <input type="hidden" name="batch_id" value={row.batch?.id ?? ""} />

          <label className="mb-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium">Qty baru</span>
            <input
              type="number"
              name="new_qty"
              defaultValue={initialQty}
              min={1}
              step={1}
              required
              className="h-10 rounded-md border border-input bg-background px-3 text-base"
            />
            <span className="text-xs text-muted-foreground">
              Qty saat ini: <strong>{formatNumber(initialQty)}</strong>{" "}
              {row.product?.unit}
            </span>
          </label>

          <label className="mb-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Alasan <span className="text-muted-foreground">(opsional)</span>
            </span>
            <input
              type="text"
              name="reason"
              placeholder="Misal: salah catat"
              maxLength={500}
              className="h-10 rounded-md border border-input bg-background px-3 text-base"
            />
          </label>

          {state && !state.ok && state.message ? (
            <p className="mb-3 text-sm text-destructive">{state.message}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Delete Confirmation Modal ----------------------------------

function VoidProductionModal({
  row,
  onClose,
}: {
  row: Row;
  onClose: () => void;
}) {
  const toast = useToast();

  const [state, formAction, pending] = useActionState<
    VoidProductionState,
    FormData
  >(voidProductionAction, { ok: false });

  // Auto-close on success (detect transition false → true)
  const prevOkRef = useRef(state.ok);
  useEffect(() => {
    if (!prevOkRef.current && state.ok) {
      toast.success("Produksi berhasil dihapus.");
      onClose();
    }
    prevOkRef.current = state.ok;
  }, [state.ok, onClose, toast]);

  // Jika batch sudah habis (voided/0), jangan tampilkan form hapus
  if (row.batch && row.batch.remaining_qty <= 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Hapus produksi</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Batch ini sudah dihapus sebelumnya. Tidak ada stok tersisa.
          </p>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Hapus produksi</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-2 text-sm">Yakin ingin menghapus produksi berikut?</p>
        <div className="mb-4 rounded-md bg-muted p-3 text-sm">
          <p>
            <strong>{row.product?.name ?? "—"}</strong> · {row.product?.sku}
          </p>
          <p>
            Qty: <strong>{formatNumber(row.quantity)}</strong>{" "}
            {row.product?.unit}
          </p>
          <p className="text-xs text-muted-foreground">
            Waktu: {formatDateTime(row.occurred_at)}
          </p>
        </div>

        <form action={formAction}>
          <input type="hidden" name="batch_id" value={row.batch?.id ?? ""} />

          <label className="mb-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Alasan <span className="text-muted-foreground">(opsional)</span>
            </span>
            <input
              type="text"
              name="reason"
              placeholder="Misal: produksi ganda"
              maxLength={500}
              className="h-10 rounded-md border border-input bg-background px-3 text-base"
            />
          </label>

          {state && !state.ok && state.message ? (
            <p className="mb-3 text-sm text-destructive">{state.message}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Menghapus…" : "Ya, hapus"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Main Component --------------------------------------------

export function ProductionHistory({
  centralKitchens,
  defaultLocationId,
  active = true,
}: {
  centralKitchens: Location[];
  defaultLocationId: string | null;
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Modal state
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [voidTarget, setVoidTarget] = useState<Row | null>(null);

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
      const { start, end } = dayRangeIso(date);
      let query = supabase
        .from("stock_movements")
        .select(
          `
            id, occurred_at, quantity, notes,
            batch:stock_batches!stock_movements_batch_id_fkey(id, initial_qty, remaining_qty, produced_at, expires_at),
            product:products(sku, name, unit, is_perishable),
            location:locations(id, code, name),
            actor:profiles(full_name)
          `,
        )
        .eq("movement_type", "production_in")
        .gte("occurred_at", start)
        .lt("occurred_at", end)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (locationId !== "all") {
        query = query.eq("location_id", locationId);
      } else if (centralKitchens.length > 0) {
        query = query.in(
          "location_id",
          centralKitchens.map((l) => l.id),
        );
      }

      return await query;
    },
    [centralKitchens, date, locationId, supabase],
  );

  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  useEffect(() => {
    if (!active || pageSize === null) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setRows([]);
        setHasMore(true);
        setError(null);
        setStale(false);
        scrollAreaRef.current?.scrollTo({ top: 0 });

        const { data, error } = await fetchRows(0, pageSize);
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        const nextRows = (data ?? []) as unknown as Row[];
        setRows(nextRows);
        setHasMore(nextRows.length === pageSize);
        setLoading(false);
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, fetchRows, pageSize]);

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

    const nextRows = (data ?? []) as unknown as Row[];
    setRows((prev) => [...prev, ...nextRows]);
    setHasMore(nextRows.length === pageSize);
    setLoadingMore(false);
  }, [fetchRows, hasMore, loading, loadingMore, pageSize, rows.length]);

  const refresh = useCallback(async () => {
    if (!active || pageSize === null) return;
    setLoading(true);
    setRows([]);
    setHasMore(true);
    setError(null);
    setStale(false);
    scrollAreaRef.current?.scrollTo({ top: 0 });

    const { data, error } = await fetchRows(0, pageSize);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const nextRows = (data ?? []) as unknown as Row[];
    setRows(nextRows);
    setHasMore(nextRows.length === pageSize);
    setLoading(false);
  }, [active, fetchRows, pageSize]);

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

  // Realtime subscribe
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
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

  const totalQty = rows.reduce(
    (sum, r) => sum + Number(r.batch?.initial_qty ?? r.quantity ?? 0),
    0,
  );
  const productCount = new Set(rows.map((r) => r.product?.sku).filter(Boolean))
    .size;

  return (
    <div className="flex h-[calc(100dvh-21.5rem)] min-h-[24rem] flex-col gap-4 lg:h-[calc(100dvh-19rem)]">
      <div className="sticky top-0 z-20 flex flex-shrink-0 flex-wrap items-end gap-3 bg-card pb-2">
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
            className={cn("h-4 w-4", (loading || stale) && "animate-spin")}
          />
          {stale ? "Sinkron…" : "Muat ulang"}
        </Button>

        <p className="ml-auto text-xs text-muted-foreground">
          {rows.length} batch dimuat - {formatHumanDate(date)} - TZ {TZ}
        </p>
      </div>

      {error ? (
        <p className="flex-shrink-0 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <div ref={scrollAreaRef} className="h-full overflow-auto">
          <table className="w-full min-w-[68rem] caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className={stickyHeadClass}>Waktu</TableHead>
              <TableHead className={stickyHeadClass}>Produk</TableHead>
              <TableHead className={stickyHeadClass}>Lokasi</TableHead>
              <TableHead className={cn(stickyHeadClass, "text-right")}>
                Qty
              </TableHead>
              <TableHead className={stickyHeadClass}>Kedaluwarsa</TableHead>
              <TableHead className={stickyHeadClass}>Aktor</TableHead>
              <TableHead className={stickyHeadClass}>Catatan</TableHead>
              <TableHead className={cn(stickyHeadClass, "w-20")}>
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: MIN_PAGE_SIZE }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8} className="py-4">
                    <div className="h-5 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10">
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
                        <Badge variant="warning" className="ml-2 align-middle">
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
                    {formatNumber(Number(r.batch?.initial_qty ?? r.quantity))}{" "}
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
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Edit qty"
                        onClick={() => setEditTarget(r)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Hapus produksi"
                        onClick={() => setVoidTarget(r)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </table>

          <div ref={sentinelRef} className="h-6" />
          {!loading && rows.length > 0 ? (
            <div className="flex justify-center px-3 pb-4 text-sm text-muted-foreground">
              {loadingMore
                ? "Memuat produksi berikutnya..."
                : hasMore
                  ? "Gulir tabel untuk memuat lagi"
                  : "Semua data sudah dimuat"}
            </div>
          ) : null}
        </div>
      </div>

      {!loading && rows.length > 0 ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
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

      {/* Modals */}
      {editTarget && (
        <EditQtyModal
          row={editTarget}
          onClose={() => {
            setEditTarget(null);
            void refresh();
          }}
        />
      )}
      {voidTarget && (
        <VoidProductionModal
          row={voidTarget}
          onClose={() => {
            setVoidTarget(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
