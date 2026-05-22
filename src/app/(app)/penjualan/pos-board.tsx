"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  History,
  Layers,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useMasterData } from "@/components/master-data-provider";
import type {
  MasterCategory,
  MasterLocation,
  MasterProduct,
} from "@/lib/master-data";
import { formatDate, formatNumber, hoursBetween } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { createSaleAction } from "./actions";
import {
  BatchPickerDialog,
  type BatchOption,
  type SplitDraft,
} from "./batch-picker-dialog";
import {
  SaleHistorySheet,
  type SaleHistoryRow,
} from "./sale-history-sheet";

/**
 * Tipe-tipe ini di-alias dari master data agar kode lama yang import
 * `PosProduct` / `PosOutlet` / `PosCategory` tidak perlu diubah.
 */
export type PosProduct = MasterProduct;
export type PosOutlet = MasterLocation;
export type PosCategory = MasterCategory;

type Batch = {
  id: string;
  product_id: string;
  produced_at: string;
  expires_at: string | null;
  remaining_qty: number;
};

type FilterTab = "all" | "perishable" | "non_perishable" | "expiring";

type CartItem = {
  uid: string;
  product_id: string;
  /**
   * Distribusi qty ke batch. 1 elemen dengan batch_id=null = mode FIFO,
   * sistem yang pecah otomatis. >0 elemen dengan batch_id terisi = mode
   * manual: kasir set qty per batch (boleh > 1 batch).
   */
  splits: Split[];
};

type Split = {
  batch_id: string | null;
  quantity: number;
};

type ProductMeta = {
  product: PosProduct;
  totalStock: number;
  batches: Batch[];
  nearestExpiringBatch: Batch | null;
};

const TAB_LABEL: Record<FilterTab, string> = {
  all: "Semua",
  perishable: "Perishable",
  non_perishable: "Non-perishable",
  expiring: "Hampir expired",
};

const FILTER_KEY = "pos-board:filters";

type PersistedFilters = {
  outletId?: string;
  tab?: FilterTab;
  showOutOfStock?: boolean;
  categoryFilter?: string;
};

function readPersistedFilters(): PersistedFilters {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writePersistedFilters(filters: PersistedFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

export function PosBoard({
  allowedOutletIds,
  defaultOutletId,
  history,
}: {
  allowedOutletIds: string[];
  defaultOutletId: string;
  history: SaleHistoryRow[];
}) {
  // Master data dari provider (di-fetch sekali di layout, tidak hit DB
  // setiap navigasi). `outlets` di sini = subset locations type='outlet'
  // yang memang allowed untuk user ini.
  const master = useMasterData();
  const allowedSet = useMemo(
    () => new Set(allowedOutletIds),
    [allowedOutletIds],
  );
  const outlets = useMemo(
    () => master.locations.filter((l) => allowedSet.has(l.id)),
    [master.locations, allowedSet],
  );
  const products = master.products;
  const categories = master.categories;

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const toast = useToast();

  // Track jika sudah mounted client-side. Saat first paint (SSR), default
  // values tampil. Setelah mount, kita switch ke saved values via setState.
  // Pendekatan ini mencegah hydration mismatch sambil tetap restore filter.
  const [outletId, setOutletIdState] = useState<string>(defaultOutletId);
  const [batchesByProduct, setBatchesByProduct] = useState<
    Record<string, Batch[]>
  >({});
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tab, setTabState] = useState<FilterTab>("all");
  const [showOutOfStock, setShowOutOfStockState] = useState(false);
  const [categoryFilter, setCategoryFilterState] = useState<string>("all");

  // Restore saved filter values dari localStorage sekali saat mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const saved = readPersistedFilters();
    if (
      saved.outletId &&
      outlets.some((o) => o.id === saved.outletId)
    ) {
      setOutletIdState(saved.outletId);
    }
    const validTabs: FilterTab[] = [
      "all",
      "perishable",
      "non_perishable",
      "expiring",
    ];
    if (saved.tab && validTabs.includes(saved.tab)) {
      setTabState(saved.tab);
    }
    if (typeof saved.showOutOfStock === "boolean") {
      setShowOutOfStockState(saved.showOutOfStock);
    }
    if (typeof saved.categoryFilter === "string") {
      if (
        saved.categoryFilter === "all" ||
        saved.categoryFilter === "none" ||
        categories.some((c) => c.id === saved.categoryFilter)
      ) {
        setCategoryFilterState(saved.categoryFilter);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Setter wrappers — write ke localStorage SEGERA setiap user mengubah
  // filter (bukan via useEffect deps). Tidak ada race condition.
  const setOutletId = useCallback((value: string) => {
    setOutletIdState(value);
    const current = readPersistedFilters();
    writePersistedFilters({ ...current, outletId: value });
  }, []);
  const setTab = useCallback((value: FilterTab) => {
    setTabState(value);
    const current = readPersistedFilters();
    writePersistedFilters({ ...current, tab: value });
  }, []);
  const setShowOutOfStock = useCallback((value: boolean) => {
    setShowOutOfStockState(value);
    const current = readPersistedFilters();
    writePersistedFilters({ ...current, showOutOfStock: value });
  }, []);
  const setCategoryFilter = useCallback((value: string) => {
    setCategoryFilterState(value);
    const current = readPersistedFilters();
    writePersistedFilters({ ...current, categoryFilter: value });
  }, []);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);

  const [pickerProductId, setPickerProductId] = useState<string | null>(null);
  const [pickerCartUid, setPickerCartUid] = useState<string | null>(null);

  const idPrefix = useId();
  const counterRef = useRef(0);
  const newCartUid = useCallback(
    () => `${idPrefix}-${counterRef.current++}`,
    [idPrefix],
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  const refetchBatches = useCallback(async () => {
    if (!outletId) return;
    const { data, error } = await supabase
      .from("stock_batches")
      .select("id, product_id, produced_at, expires_at, remaining_qty")
      .eq("location_id", outletId)
      .gt("remaining_qty", 0)
      .order("produced_at", { ascending: true });
    if (error) {
      setBatchError(error.message);
      return;
    }
    const grouped: Record<string, Batch[]> = {};
    for (const b of (data ?? []) as Batch[]) {
      (grouped[b.product_id] ??= []).push(b);
    }
    setBatchesByProduct(grouped);
  }, [supabase, outletId]);

  // Fetch batch saat outlet berubah.
  useEffect(() => {
    if (!outletId) return;
    let active = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setBatchLoading(true);
    setBatchError(null);
    void refetchBatches().finally(() => {
      if (!active) return;
      setBatchLoading(false);
    });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      active = false;
    };
  }, [refetchBatches, outletId]);

  // Realtime: re-fetch saat ada perubahan stok di outlet ini.
  // Catatan: realtime Supabase disabled di dev lokal (lihat
  // docs/development.md) — ini berfungsi di Supabase Cloud. Untuk lokal
  // kita tetap punya fallback refetch manual setelah submit transaksi.
  useEffect(() => {
    if (!outletId) return;
    const channel = supabase
      .channel(`pos-stock-${outletId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_batches",
          filter: `location_id=eq.${outletId}`,
        },
        () => {
          void refetchBatches();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, outletId, refetchBatches]);

  // Reset cart saat outlet berubah.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCart([]);
    setNotes("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [outletId]);

  const productMeta = useMemo<Map<string, ProductMeta>>(() => {
    const map = new Map<string, ProductMeta>();
    for (const p of products) {
      const batches = batchesByProduct[p.id] ?? [];
      const totalStock = batches.reduce(
        (sum, b) => sum + Number(b.remaining_qty),
        0,
      );
      const nearestExpiringBatch = p.is_perishable
        ? batches.find(
            (b) =>
              b.expires_at &&
              hoursBetween(new Date(), b.expires_at) <= p.expiry_warning_hours,
          ) ?? null
        : null;
      map.set(p.id, { product: p, totalStock, batches, nearestExpiringBatch });
    }
    return map;
  }, [products, batchesByProduct]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const meta = productMeta.get(p.id)!;
      if (!showOutOfStock && meta.totalStock <= 0) return false;
      if (tab === "perishable" && !p.is_perishable) return false;
      if (tab === "non_perishable" && p.is_perishable) return false;
      if (tab === "expiring" && !meta.nearestExpiringBatch) return false;
      if (categoryFilter !== "all") {
        if (categoryFilter === "none") {
          if (p.category_id != null) return false;
        } else if (p.category_id !== categoryFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${p.sku} ${p.name} ${p.category?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, productMeta, search, tab, showOutOfStock, categoryFilter]);

  // Hitung jumlah produk per kategori (yang punya stok) untuk badge angka di chip.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, none: 0 };
    for (const p of products) {
      const meta = productMeta.get(p.id);
      if (!meta) continue;
      if (!showOutOfStock && meta.totalStock <= 0) continue;
      counts.all = (counts.all ?? 0) + 1;
      const key = p.category_id ?? "none";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [products, productMeta, showOutOfStock]);

  const expiringCount = useMemo(
    () =>
      products.reduce(
        (n, p) => n + (productMeta.get(p.id)?.nearestExpiringBatch ? 1 : 0),
        0,
      ),
    [products, productMeta],
  );

  const cartByProduct = useMemo(() => {
    const map = new Map<string, CartItem>();
    for (const ci of cart) map.set(ci.product_id, ci);
    return map;
  }, [cart]);

  const cartTotalQty = cart.reduce(
    (sum, c) => sum + c.splits.reduce((a, s) => a + s.quantity, 0),
    0,
  );

  const cartErrors = useMemo(() => {
    const errs: string[] = [];
    for (const ci of cart) {
      const meta = productMeta.get(ci.product_id);
      if (!meta) continue;
      const totalQty = ci.splits.reduce((s, x) => s + x.quantity, 0);
      if (totalQty <= 0) {
        errs.push(`${meta.product.name}: qty kosong`);
        continue;
      }
      const isManual =
        ci.splits.length > 0 && ci.splits.every((s) => s.batch_id !== null);
      if (isManual) {
        for (const s of ci.splits) {
          const b = meta.batches.find((x) => x.id === s.batch_id);
          if (!b) {
            errs.push(`${meta.product.name}: batch tidak ditemukan`);
          } else if (s.quantity > Number(b.remaining_qty)) {
            errs.push(
              `${meta.product.name}: batch ${b.id.slice(0, 6)} hanya ${formatNumber(b.remaining_qty)} ${meta.product.unit}`,
            );
          }
        }
      } else if (totalQty > meta.totalStock) {
        errs.push(
          `${meta.product.name}: stok hanya ${formatNumber(meta.totalStock)} ${meta.product.unit}`,
        );
      }
    }
    return errs;
  }, [cart, productMeta]);

  const canSubmit = cart.length > 0 && cartErrors.length === 0 && !submitting;

  const addToCart = useCallback(
    (product: PosProduct) => {
      const meta = productMeta.get(product.id);
      if (!meta || meta.totalStock <= 0) return;
      setCart((prev) => {
        const existing = prev.find((c) => c.product_id === product.id);
        if (existing) {
          const isManual =
            existing.splits.length > 0 &&
            existing.splits.every((s) => s.batch_id !== null);
          // Mode manual: jangan auto +1 (kasir kontrol penuh via picker).
          if (isManual) return prev;
          // Mode FIFO: tambah qty +1 sampai mentok stok.
          const currentQty = existing.splits.reduce(
            (s, x) => s + x.quantity,
            0,
          );
          const next = Math.min(currentQty + 1, meta.totalStock);
          return prev.map((c) =>
            c.product_id === product.id
              ? { ...c, splits: [{ batch_id: null, quantity: next }] }
              : c,
          );
        }
        return [
          ...prev,
          {
            uid: newCartUid(),
            product_id: product.id,
            splits: [{ batch_id: null, quantity: 1 }],
          },
        ];
      });
    },
    [productMeta, newCartUid],
  );

  const setFifoQty = useCallback((uid: string, qty: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.uid === uid
          ? {
              ...c,
              splits: [
                {
                  batch_id: null,
                  quantity: Math.max(1, Math.floor(qty || 1)),
                },
              ],
            }
          : c,
      ),
    );
  }, []);

  const incrementFifoQty = useCallback(
    (uid: string, delta: number) =>
      setCart((prev) =>
        prev.map((c) => {
          if (c.uid !== uid) return c;
          const current = c.splits.reduce((s, x) => s + x.quantity, 0);
          const next = Math.max(1, current + delta);
          return {
            ...c,
            splits: [{ batch_id: null, quantity: next }],
          };
        }),
      ),
    [],
  );

  const setSplits = useCallback((uid: string, splits: SplitDraft[]) => {
    setCart((prev) =>
      prev.map((c) =>
        c.uid === uid
          ? {
              ...c,
              splits: splits.map((s) => ({
                batch_id: s.batch_id,
                quantity: s.quantity,
              })),
            }
          : c,
      ),
    );
  }, []);

  const removeItem = useCallback(
    (uid: string) => setCart((prev) => prev.filter((c) => c.uid !== uid)),
    [],
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setNotes("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    const fd = new FormData();
    fd.set("location_id", outletId);
    fd.set("occurred_at", new Date().toISOString());
    fd.set("notes", notes);
    fd.set(
      "items",
      JSON.stringify(
        // Setiap split = 1 sale_item (boleh banyak per produk).
        cart.flatMap((c) =>
          c.splits
            .filter((s) => s.quantity > 0)
            .map((s) => ({
              product_id: c.product_id,
              quantity: s.quantity,
              override_batch_id: s.batch_id,
            })),
        ),
      ),
    );
    setSubmitting(true);
    const result = await createSaleAction({ ok: false }, fd);
    setSubmitting(false);
    if (result.ok) {
      toast.success("Transaksi tercatat", "Stok sudah dipotong otomatis.");
      clearCart();
      setCartSheetOpen(false);
      // Refetch manual karena realtime di-disable di dev lokal.
      // Di production, realtime channel juga akan memicu refetch (idempotent).
      void refetchBatches();
    } else {
      toast.error("Gagal mencatat", result.message ?? "Periksa kembali isian.");
    }
  }, [canSubmit, outletId, notes, cart, toast, clearCart, refetchBatches]);

  // Keyboard shortcuts: "/" focus search, Ctrl/Cmd+Enter submit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (!inField && e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSubmit, handleSubmit]);

  const pickerProduct = pickerProductId
    ? productMeta.get(pickerProductId)
    : null;
  const pickerCartItem = pickerCartUid
    ? cart.find((c) => c.uid === pickerCartUid) ?? null
    : null;


  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Cari produk
              </span>
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Nama atau SKU… (tekan / untuk fokus)"
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  className="pl-9"
                />
              </div>
            </label>
          </div>

          {outlets.length > 1 ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Outlet
              </span>
              <Select
                value={outletId}
                onChange={(e) => setOutletId(e.currentTarget.value)}
                className="min-w-52"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4" />
            Riwayat
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(TAB_LABEL) as FilterTab[]).map((t) => {
            const active = tab === t;
            const badge =
              t === "expiring" && expiringCount > 0 ? expiringCount : null;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {TAB_LABEL[t]}
                {badge != null ? (
                  <span className="rounded-full bg-warning/20 px-1.5 text-[10px] font-semibold text-warning">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showOutOfStock}
              onChange={(e) => setShowOutOfStock(e.currentTarget.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Tampilkan stok habis
          </label>
        </div>

        {/* Baris chip kategori (AND dengan tab di atas) */}
        {categories.length > 0 || (categoryCounts.none ?? 0) > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChip
              active={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
              label="Semua kategori"
              count={categoryCounts.all}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                active={categoryFilter === c.id}
                onClick={() => setCategoryFilter(c.id)}
                label={c.name}
                icon={c.icon}
                color={c.color}
                count={categoryCounts[c.id] ?? 0}
              />
            ))}
            {(categoryCounts.none ?? 0) > 0 ? (
              <CategoryChip
                active={categoryFilter === "none"}
                onClick={() => setCategoryFilter("none")}
                label="Tanpa kategori"
                count={categoryCounts.none}
              />
            ) : null}
          </div>
        ) : null}

        {batchError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {batchError}
          </p>
        ) : null}

        {batchLoading && Object.keys(batchesByProduct).length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-lg border bg-muted/30"
              />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
            Tidak ada produk yang cocok dengan filter ini.
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((p) => {
              const meta = productMeta.get(p.id)!;
              const cartItem = cartByProduct.get(p.id);
              return (
                <li key={p.id}>
                  <ProductCard
                    product={p}
                    meta={meta}
                    inCartQty={
                      cartItem
                        ? cartItem.splits.reduce((s, x) => s + x.quantity, 0)
                        : 0
                    }
                    onTap={() => addToCart(p)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <CartPanel
            outlets={outlets}
            outletId={outletId}
            onOutletChange={setOutletId}
            cart={cart}
            productMeta={productMeta}
            errors={cartErrors}
            notes={notes}
            onNotesChange={setNotes}
            onSetFifoQty={setFifoQty}
            onIncrementFifo={incrementFifoQty}
            onRemove={removeItem}
            onClear={clearCart}
            onPickBatch={(uid, productId) => {
              setPickerCartUid(uid);
              setPickerProductId(productId);
            }}
            onSubmit={handleSubmit}
            canSubmit={canSubmit}
            submitting={submitting}
          />
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-16 z-30 px-4 lg:hidden">
        {cart.length > 0 ? (
          <button
            type="button"
            onClick={() => setCartSheetOpen(true)}
            className="flex w-full items-center justify-between rounded-full border border-primary/40 bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              {cart.length} item · {formatNumber(cartTotalQty)} qty
            </span>
            <span className="text-xs opacity-80">Buka</span>
          </button>
        ) : null}
      </div>

      <Sheet
        open={cartSheetOpen}
        onOpenChange={setCartSheetOpen}
        side="bottom"
        title="Keranjang"
        description={`${cart.length} produk · ${formatNumber(cartTotalQty)} qty`}
      >
        <div className="p-4">
          <CartPanel
            outlets={outlets}
            outletId={outletId}
            onOutletChange={setOutletId}
            cart={cart}
            productMeta={productMeta}
            errors={cartErrors}
            notes={notes}
            onNotesChange={setNotes}
            onSetFifoQty={setFifoQty}
            onIncrementFifo={incrementFifoQty}
            onRemove={removeItem}
            onClear={clearCart}
            onPickBatch={(uid, productId) => {
              setPickerCartUid(uid);
              setPickerProductId(productId);
            }}
            onSubmit={handleSubmit}
            canSubmit={canSubmit}
            submitting={submitting}
            embedded
          />
        </div>
      </Sheet>

      <SaleHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        initialSales={history}
      />

      {pickerProduct && pickerCartItem ? (
        <BatchPickerDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPickerProductId(null);
              setPickerCartUid(null);
            }
          }}
          productName={pickerProduct.product.name}
          unit={pickerProduct.product.unit}
          isPerishable={pickerProduct.product.is_perishable}
          expiryWarningHours={pickerProduct.product.expiry_warning_hours}
          batches={pickerProduct.batches as BatchOption[]}
          current={pickerCartItem.splits as SplitDraft[]}
          onSave={(splits) => {
            const uid = pickerCartUid;
            if (!uid) return;
            setSplits(uid, splits);
          }}
        />
      ) : null}
    </div>
  );
}


// =========================================================================
// CategoryChip
// =========================================================================
function CategoryChip({
  active,
  onClick,
  label,
  icon,
  color,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: string | null;
  color?: string | null;
  count: number;
}) {
  // Saat aktif, pakai warna kategori sebagai aksen (kalau ada).
  const activeStyle =
    active && color
      ? {
          borderColor: `${color}80`,
          backgroundColor: `${color}1f`,
          color: color,
        }
      : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? color
            ? ""
            : "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      style={activeStyle}
    >
      {icon ? <span>{icon}</span> : null}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] tabular-nums",
          active ? "bg-current/10" : "bg-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}
function ProductCard({
  product,
  meta,
  inCartQty,
  onTap,
}: {
  product: PosProduct;
  meta: ProductMeta;
  inCartQty: number;
  onTap: () => void;
}) {
  const oos = meta.totalStock <= 0;
  const expiringSoon = meta.nearestExpiringBatch != null;
  const hoursToExp =
    expiringSoon && meta.nearestExpiringBatch?.expires_at
      ? hoursBetween(new Date(), meta.nearestExpiringBatch.expires_at)
      : null;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={oos}
      className={cn(
        "relative flex h-full w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        oos
          ? "cursor-not-allowed opacity-50"
          : "hover:border-primary/40 hover:bg-accent/30 active:scale-[0.99]",
        inCartQty > 0 && "border-primary/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold leading-tight">
            {product.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted-foreground">
              {product.sku}
            </span>
            {product.category ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                style={
                  product.category.color
                    ? {
                        borderColor: `${product.category.color}66`,
                        backgroundColor: `${product.category.color}1f`,
                        color: product.category.color,
                      }
                    : undefined
                }
              >
                {product.category.icon ? (
                  <span>{product.category.icon}</span>
                ) : null}
                {product.category.name}
              </span>
            ) : null}
          </div>
        </div>
        {inCartQty > 0 ? (
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
            {inCartQty}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px]">
        {oos ? (
          <Badge variant="muted">Stok habis</Badge>
        ) : (
          <Badge variant="outline" className="tabular-nums">
            {formatNumber(meta.totalStock)} {product.unit}
          </Badge>
        )}
        {product.is_perishable ? (
          <Badge variant="warning">Perishable</Badge>
        ) : null}
        {expiringSoon && hoursToExp != null ? (
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {hoursToExp <= 0
              ? "Lewat exp"
              : hoursToExp < 24
                ? `${Math.round(hoursToExp)}j lagi`
                : `${Math.round(hoursToExp / 24)}h lagi`}
            {product.expiry_discount_percent > 0
              ? ` · −${Math.round(product.expiry_discount_percent)}%`
              : ""}
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

// =========================================================================
// CartPanel
// =========================================================================
function CartPanel({
  outlets,
  outletId,
  onOutletChange,
  cart,
  productMeta,
  errors,
  notes,
  onNotesChange,
  onSetFifoQty,
  onIncrementFifo,
  onRemove,
  onClear,
  onPickBatch,
  onSubmit,
  canSubmit,
  submitting,
  embedded,
}: {
  outlets: PosOutlet[];
  outletId: string;
  onOutletChange: (id: string) => void;
  cart: CartItem[];
  productMeta: Map<string, ProductMeta>;
  errors: string[];
  notes: string;
  onNotesChange: (v: string) => void;
  onSetFifoQty: (uid: string, qty: number) => void;
  onIncrementFifo: (uid: string, delta: number) => void;
  onRemove: (uid: string) => void;
  onClear: () => void;
  onPickBatch: (uid: string, productId: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
  embedded?: boolean;
}) {
  const totalQty = cart.reduce(
    (s, c) => s + c.splits.reduce((a, x) => a + x.quantity, 0),
    0,
  );
  const outlet = outlets.find((o) => o.id === outletId);

  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        !embedded && "max-h-[calc(100dvh-7rem)] rounded-xl border bg-card p-4",
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4" />
          Keranjang
          <span className="text-xs font-normal text-muted-foreground">
            ({cart.length} produk · {formatNumber(totalQty)} qty)
          </span>
        </h2>
        {cart.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            aria-label="Bersihkan keranjang"
          >
            <Trash2 className="h-4 w-4" />
            Kosongkan
          </Button>
        ) : null}
      </header>

      {outlets.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Outlet penjualan
          </span>
          <Select
            value={outletId}
            onChange={(e) => onOutletChange(e.currentTarget.value)}
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
          </Select>
        </label>
      ) : outlet ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Outlet:{" "}
          <span className="font-medium text-foreground">{outlet.name}</span>
        </div>
      ) : null}

      <div
        className={cn(
          "flex-1 space-y-2 overflow-y-auto pr-1",
          !embedded && "min-h-[120px]",
        )}
      >
        {cart.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-10 text-center text-sm text-muted-foreground">
            Tap produk di kiri untuk menambah ke keranjang.
          </div>
        ) : (
          cart.map((ci) => {
            const meta = productMeta.get(ci.product_id);
            if (!meta) return null;
            const totalLineQty = ci.splits.reduce((s, x) => s + x.quantity, 0);
            const isManual =
              ci.splits.length > 0 &&
              ci.splits.every((s) => s.batch_id !== null);
            return (
              <div
                key={ci.uid}
                className="rounded-lg border bg-background/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">
                      {meta.product.name}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {meta.product.sku}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Hapus dari keranjang"
                    onClick={() => onRemove(ci.uid)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {isManual ? (
                  <div className="mt-2 space-y-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                    {ci.splits.map((s) => {
                      const b = meta.batches.find((x) => x.id === s.batch_id);
                      const over = b
                        ? s.quantity > Number(b.remaining_qty)
                        : true;
                      return (
                        <div
                          key={s.batch_id ?? "fifo"}
                          className={cn(
                            "flex items-center justify-between gap-2",
                            over && "text-destructive",
                          )}
                        >
                          <span>
                            Batch tgl{" "}
                            {b ? formatDate(b.produced_at) : "—"}
                            {b && meta.product.is_perishable && b.expires_at
                              ? ` · exp ${formatDate(b.expires_at)}`
                              : ""}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatNumber(s.quantity)} {meta.product.unit}
                          </span>
                        </div>
                      );
                    })}
                    <div className="mt-1 flex items-center justify-between border-t pt-1.5 text-foreground">
                      <span className="font-medium">Total</span>
                      <span className="font-medium tabular-nums">
                        {formatNumber(totalLineQty)} {meta.product.unit}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="inline-flex items-center rounded-md border">
                      <button
                        type="button"
                        onClick={() => onIncrementFifo(ci.uid, -1)}
                        disabled={totalLineQty <= 1}
                        className="grid h-9 w-9 place-items-center disabled:opacity-40"
                        aria-label="Kurangi"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        inputMode="numeric"
                        value={totalLineQty}
                        onChange={(e) =>
                          onSetFifoQty(
                            ci.uid,
                            Number(e.currentTarget.value),
                          )
                        }
                        className="h-9 w-14 border-x bg-transparent text-center text-sm tabular-nums focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => onIncrementFifo(ci.uid, +1)}
                        disabled={totalLineQty >= meta.totalStock}
                        className="grid h-9 w-9 place-items-center disabled:opacity-40"
                        aria-label="Tambah"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {meta.product.unit} · maks{" "}
                      {formatNumber(meta.totalStock)}
                    </span>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPickBatch(ci.uid, ci.product_id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      isManual
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Layers className="h-3 w-3" />
                    {isManual
                      ? `${ci.splits.length} batch dipilih`
                      : "FIFO otomatis"}
                  </button>
                  {meta.nearestExpiringBatch ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Exp {formatDate(meta.nearestExpiringBatch.expires_at!)}
                      {meta.product.expiry_discount_percent > 0
                        ? ` · −${Math.round(meta.product.expiry_discount_percent)}%`
                        : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {errors.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {errors.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Catatan transaksi (opsional)
        </span>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.currentTarget.value)}
          rows={2}
          maxLength={500}
          placeholder="mis. tamu VIP, event…"
        />
      </label>

      <Button
        type="button"
        size="lg"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full"
      >
        {submitting
          ? "Menyimpan…"
          : cart.length === 0
            ? "Catat penjualan"
            : `Catat penjualan (${formatNumber(totalQty)} qty)`}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Tip: tekan{" "}
        <kbd className="rounded border bg-muted px-1 py-0.5">/</kbd> untuk
        cari ·{" "}
        <kbd className="rounded border bg-muted px-1 py-0.5">Ctrl</kbd>+
        <kbd className="rounded border bg-muted px-1 py-0.5">Enter</kbd>{" "}
        untuk submit
      </p>
    </div>
  );
}
