"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDate,
  formatNumber,
  hoursBetween,
} from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createSaleAction, type SaleFormState } from "./actions";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  is_perishable: boolean;
  expiry_warning_hours: number;
  expiry_discount_percent: number;
};

type Location = { id: string; code: string; name: string };

type Batch = {
  id: string;
  product_id: string;
  produced_at: string;
  expires_at: string | null;
  remaining_qty: number;
};

type LineItem = {
  uid: string;
  product_id: string;
  quantity: string;
  override_batch_id: string;
};

const initialState: SaleFormState = { ok: false };

function newUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SaleForm({
  outlets,
  products,
  defaultOutletId,
}: {
  outlets: Location[];
  products: Product[];
  defaultOutletId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, action, pending] = useActionState(createSaleAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const [outletId, setOutletId] = useState<string>(defaultOutletId);
  const [items, setItems] = useState<LineItem[]>([
    { uid: newUid(), product_id: "", quantity: "", override_batch_id: "" },
  ]);

  // Reset form ketika sukses (transaksi tercatat).
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    /* eslint-disable react-hooks/set-state-in-effect */
    setItems([
      { uid: newUid(), product_id: "", quantity: "", override_batch_id: "" },
    ]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state]);

  // Stok per produk (untuk validasi total qty + ringkasan FIFO).
  const [batchesByProduct, setBatchesByProduct] = useState<
    Record<string, Batch[]>
  >({});
  const [batchLoading, setBatchLoading] = useState(false);

  useEffect(() => {
    if (!outletId) return;
    let active = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setBatchLoading(true);
    void supabase
      .from("stock_batches")
      .select("id, product_id, produced_at, expires_at, remaining_qty")
      .eq("location_id", outletId)
      .gt("remaining_qty", 0)
      .order("produced_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        const grouped: Record<string, Batch[]> = {};
        for (const b of (data ?? []) as Batch[]) {
          (grouped[b.product_id] ??= []).push(b);
        }
        setBatchesByProduct(grouped);
        setBatchLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      active = false;
    };
  }, [supabase, outletId]);

  // Reset baris saat outlet berubah karena batch berbeda.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setItems([
      { uid: newUid(), product_id: "", quantity: "", override_batch_id: "" },
    ]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [outletId]);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const addRow = () =>
    setItems((prev) => [
      ...prev,
      { uid: newUid(), product_id: "", quantity: "", override_batch_id: "" },
    ]);
  const removeRow = (uid: string) =>
    setItems((prev) =>
      prev.length > 1 ? prev.filter((i) => i.uid !== uid) : prev,
    );
  const updateRow = (uid: string, patch: Partial<LineItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)),
    );

  // Validasi & summary per row.
  const rowsInfo = items.map((row) => {
    const product = row.product_id ? productById.get(row.product_id) : undefined;
    const productBatches = batchesByProduct[row.product_id] ?? [];
    const totalAvailable = productBatches.reduce(
      (sum, b) => sum + Number(b.remaining_qty),
      0,
    );
    const qty = Number(row.quantity);
    const qtyValid = Number.isFinite(qty) && qty > 0;
    const qtyInt = Number.isInteger(qty);

    let error: string | null = null;
    if (!row.product_id) error = "Pilih produk";
    else if (!qtyValid) error = "Qty min. 1";
    else if (!qtyInt) error = "Qty harus bilangan bulat";
    else if (qty > totalAvailable)
      error = `Stok hanya ${formatNumber(totalAvailable)} ${product?.unit ?? ""}`;

    if (!error && row.override_batch_id) {
      const batch = productBatches.find((b) => b.id === row.override_batch_id);
      if (!batch) error = "Batch tidak ada";
      else if (qty > Number(batch.remaining_qty))
        error = `Batch hanya ${formatNumber(batch.remaining_qty)} ${product?.unit ?? ""}`;
    }

    // Saran diskon expired (batch terdekat).
    const nearestExpiringBatch = product?.is_perishable
      ? productBatches.find(
          (b) =>
            b.expires_at &&
            hoursBetween(new Date(), b.expires_at) <= product.expiry_warning_hours,
        )
      : undefined;

    return { product, productBatches, totalAvailable, error, nearestExpiringBatch };
  });

  const dupProduct = items.some(
    (row, i) =>
      row.product_id &&
      items.findIndex((r) => r.product_id === row.product_id) !== i,
  );

  const valid =
    !!outletId &&
    items.length > 0 &&
    rowsInfo.every((r) => r.error === null) &&
    !dupProduct;

  const itemsJson = JSON.stringify(
    items
      .filter((i) => i.product_id && Number(i.quantity) > 0)
      .map((i) => ({
        product_id: i.product_id,
        quantity: Number(i.quantity),
        override_batch_id: i.override_batch_id || null,
      })),
  );

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Outlet"
          htmlFor="location_id"
          required
          error={state.fieldErrors?.location_id}
        >
          <Select
            id="location_id"
            name="location_id"
            value={outletId}
            onChange={(e) => setOutletId(e.currentTarget.value)}
            required
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Waktu transaksi"
          htmlFor="occurred_at"
          required
          error={state.fieldErrors?.occurred_at}
        >
          <Input
            id="occurred_at"
            name="occurred_at"
            type="datetime-local"
            defaultValue={toLocalInput(new Date())}
            required
          />
        </FormField>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Item</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addRow}
            disabled={!outletId || products.length === 0}
          >
            <Plus className="h-4 w-4" />
            Tambah baris
          </Button>
        </div>

        {batchLoading ? (
          <p className="text-sm text-muted-foreground">Memuat stok…</p>
        ) : null}

        <div className="space-y-3">
          {items.map((row, idx) => {
            const info = rowsInfo[idx];
            const productBatches = info.productBatches;
            const showWarning =
              info.product?.is_perishable && info.nearestExpiringBatch;

            return (
              <div
                key={row.uid}
                className="grid gap-3 rounded-lg border bg-background/50 p-3 sm:grid-cols-[2fr_120px_2fr_auto] sm:items-end"
              >
                <FormField
                  label={`Produk ${idx + 1}`}
                  htmlFor={`product-${row.uid}`}
                >
                  <Select
                    id={`product-${row.uid}`}
                    value={row.product_id}
                    onChange={(e) =>
                      updateRow(row.uid, {
                        product_id: e.currentTarget.value,
                        override_batch_id: "",
                      })
                    }
                  >
                    <option value="">Pilih produk</option>
                    {products.map((p) => {
                      const total =
                        batchesByProduct[p.id]?.reduce(
                          (sum, b) => sum + Number(b.remaining_qty),
                          0,
                        ) ?? 0;
                      return (
                        <option key={p.id} value={p.id} disabled={total <= 0}>
                          {p.sku} — {p.name} (stok {formatNumber(total)} {p.unit})
                        </option>
                      );
                    })}
                  </Select>
                </FormField>

                <FormField
                  label={`Qty${info.product?.unit ? ` (${info.product.unit})` : ""}`}
                  htmlFor={`qty-${row.uid}`}
                  error={info.error ?? undefined}
                >
                  <Input
                    id={`qty-${row.uid}`}
                    type="number"
                    min={1}
                    step="1"
                    inputMode="numeric"
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(row.uid, { quantity: e.currentTarget.value })
                    }
                  />
                </FormField>

                <FormField
                  label="Override batch"
                  htmlFor={`batch-${row.uid}`}
                  hint="Kosong = FIFO otomatis"
                >
                  <Select
                    id={`batch-${row.uid}`}
                    value={row.override_batch_id}
                    onChange={(e) =>
                      updateRow(row.uid, {
                        override_batch_id: e.currentTarget.value,
                      })
                    }
                    disabled={!row.product_id || productBatches.length === 0}
                  >
                    <option value="">Otomatis (FIFO)</option>
                    {productBatches.map((b) => {
                      const expLabel =
                        info.product?.is_perishable && b.expires_at
                          ? ` · exp ${formatDate(b.expires_at)}`
                          : "";
                      return (
                        <option key={b.id} value={b.id}>
                          Tgl {formatDate(b.produced_at)} · sisa{" "}
                          {formatNumber(b.remaining_qty)}
                          {expLabel}
                        </option>
                      );
                    })}
                  </Select>
                </FormField>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.uid)}
                  disabled={items.length === 1}
                  aria-label="Hapus baris"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                {showWarning ? (
                  <div className="sm:col-span-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    <span>
                      Batch terdekat exp{" "}
                      {formatDate(info.nearestExpiringBatch!.expires_at)} —
                      pertimbangkan diskon
                    </span>
                    {info.product!.expiry_discount_percent > 0 ? (
                      <Badge variant="warning">
                        Saran {Math.round(info.product!.expiry_discount_percent)}%
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {dupProduct ? (
          <p className="text-sm text-destructive">
            Produk yang sama tidak boleh muncul di dua baris.
          </p>
        ) : null}
      </div>

      <FormField label="Catatan" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} maxLength={500} />
      </FormField>

      <input type="hidden" name="items" value={itemsJson} />

      {state.message && !state.ok ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Menyimpan…" : "Catat penjualan"}
        </Button>
      </div>
    </form>
  );
}
