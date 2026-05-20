"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
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
import { formatDate, formatDateTime, formatNumber, hoursBetween } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { DisposalDialog } from "./disposal-dialog";

type Location = {
  id: string;
  code: string;
  name: string;
  type: "central_kitchen" | "outlet";
};

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

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  is_perishable: boolean;
  expiry_warning_hours: number;
  expiry_discount_percent: number;
};

const FILTER_KEY = "stock-board:filters";

type CategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

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

export function StockBoard({
  locations,
  categories,
  defaultLocationId,
}: {
  locations: Location[];
  categories: CategoryOption[];
  defaultLocationId: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [locationId, setLocationId] = useState<string | "all">(
    () => readSavedFilter()?.locationId ?? defaultLocationId ?? "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Persist filter.
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
    let query = supabase
      .from("v_stock_per_location")
      .select(
        "product_id, sku, product_name, unit, is_perishable, category_id, category_name, category_icon, category_color, location_id, location_code, location_name, total_qty, active_batches, nearest_expiry, oldest_produced_at",
      )
      .order("product_name", { ascending: true });
    if (locationId !== "all") query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as StockRow[]);

    // Pre-fetch product threshold/discount agar warning expired bisa hidup.
    const ids = Array.from(new Set((data ?? []).map((r) => r.product_id)));
    if (ids.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select(
          "id, sku, name, unit, is_perishable, expiry_warning_hours, expiry_discount_percent",
        )
        .in("id", ids);
      const map: Record<string, Product> = {};
      for (const p of products ?? []) map[p.id] = p as Product;
      setProductsById(map);
    } else {
      setProductsById({});
    }
    setLoading(false);
  }, [supabase, locationId]);

  // Bridge ke Supabase (sumber EXTERNAL): setState di sini intentional.
  // Lihat https://react.dev/reference/react/useEffect#fetching-data-with-effects
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

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

  const filteredRows = useMemo(() => {
    if (categoryFilter === "all") return rows;
    return rows.filter((r) => {
      if (categoryFilter === "none") return r.category_id == null;
      return r.category_id === categoryFilter;
    });
  }, [rows, categoryFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
                {l.code} — {l.name}{" "}
                {l.type === "central_kitchen" ? "(CP)" : ""}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Muat ulang
        </Button>
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produk</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Lokasi</TableHead>
              <TableHead className="text-right">Total stok</TableHead>
              <TableHead className="text-right">Batch</TableHead>
              <TableHead>Expired terdekat</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10">
                  <EmptyState
                    title="Belum ada stok"
                    description="Catat produksi atau stok masuk untuk mulai mengisi inventaris."
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => {
                const product = productsById[r.product_id];
                const warningHours = product?.expiry_warning_hours ?? 24;
                const isWarning =
                  r.is_perishable &&
                  r.nearest_expiry &&
                  hoursBetween(new Date(), r.nearest_expiry) <= warningHours;
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
                          {r.category_icon ? <span>{r.category_icon}</span> : null}
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
                          {isWarning ? (
                            <AlertTriangle
                              aria-label="Mendekati kedaluwarsa"
                              className="h-4 w-4 text-warning"
                            />
                          ) : null}
                          <span
                            className={cn(
                              "text-sm",
                              isWarning && "font-medium text-warning-foreground",
                            )}
                          >
                            {formatDateTime(r.nearest_expiry)}
                          </span>
                          {isWarning && product?.expiry_discount_percent ? (
                            <Badge variant="warning">
                              Saran diskon {Math.round(product.expiry_discount_percent)}%
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
        </Table>
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
