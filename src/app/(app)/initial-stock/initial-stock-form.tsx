"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { recordInitialStockAction } from "./actions";
import type { InitialStockState } from "./actions";
import type { MasterProduct, MasterLocation } from "@/lib/master-data";

type LineItem = {
  uid: string;
  location_id: string;
  product_id: string;
  quantity: string;
  produced_at: string;
  expires_at: string;
  notes: string;
};

const initialState: InitialStockState = { ok: false };

function toLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateStartIso(date: string): string {
  return new Date(`${date}T00:00`).toISOString();
}

function createEmptyRow(uid: string, locationId: string): LineItem {
  return {
    uid,
    location_id: locationId,
    product_id: "",
    quantity: "",
    produced_at: toLocalDate(new Date()),
    expires_at: "",
    notes: "",
  };
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tambah jam ke datetime-local string. */
function addHoursLocal(input: string, hours: number): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return toLocalInput(d);
}

export function InitialStockForm({
  products,
  locations,
  defaultLocationId,
}: {
  products: MasterProduct[];
  locations: MasterLocation[];
  defaultLocationId: string;
}) {
  const [state, action, pending] = useActionState(
    recordInitialStockAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Stable id prefix + counter
  const idPrefix = useId();
  const counterRef = useRef(1);
  const nextUid = useCallback(
    () => `${idPrefix}-${counterRef.current++}`,
    [idPrefix],
  );
  const makeEmptyRow = useCallback(
    (uid: string): LineItem => createEmptyRow(uid, defaultLocationId),
    [defaultLocationId],
  );

  const [items, setItems] = useState<LineItem[]>(() => [
    createEmptyRow(`${idPrefix}-0`, defaultLocationId),
  ]);

  // Reset form setelah server action sukses.
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    const resetId = window.setTimeout(() => {
      setItems([makeEmptyRow(nextUid())]);
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [state.ok, makeEmptyRow, nextUid]);

  const productById = useMemo(() => {
    const map = new Map<string, MasterProduct>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const addRow = () => setItems((prev) => [...prev, makeEmptyRow(nextUid())]);

  useEffect(() => {
    if (state.ok || !state.itemErrors?.length || !state.successCount) return;
    const failedIndexes = new Set(state.itemErrors.map((error) => error.index));
    const trimId = window.setTimeout(() => {
      setItems((prev) => {
        const failedRows = prev.filter((_, index) => failedIndexes.has(index));
        return failedRows.length > 0 ? failedRows : prev;
      });
    }, 0);
    return () => window.clearTimeout(trimId);
  }, [state.itemErrors, state.ok, state.successCount]);

  const removeRow = (uid: string) =>
    setItems((prev) =>
      prev.length > 1 ? prev.filter((i) => i.uid !== uid) : prev,
    );

  const updateRow = (uid: string, patch: Partial<LineItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)),
    );

  const handleProductChange = (uid: string, productId: string) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.uid !== uid) return row;
        const p = productById.get(productId);
        const next: LineItem = { ...row, product_id: productId };
        // Auto-fill expires_at based on produced_at + shelf life
        if (p?.is_perishable && p.default_shelf_life_hours && row.produced_at) {
          const prodInput = `${row.produced_at}T00:00`;
          next.expires_at = addHoursLocal(
            prodInput,
            p.default_shelf_life_hours,
          );
        }
        return next;
      }),
    );
  };

  const handleProducedAtChange = (uid: string, value: string) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.uid !== uid) return row;
        const p = row.product_id ? productById.get(row.product_id) : undefined;
        const next: LineItem = { ...row, produced_at: value };
        // Re-compute expires_at
        if (p?.is_perishable && p.default_shelf_life_hours && value) {
          const prodInput = `${value}T00:00`;
          next.expires_at = addHoursLocal(
            prodInput,
            p.default_shelf_life_hours,
          );
        }
        return next;
      }),
    );
  };

  // Validasi per baris
  const rowsInfo = items.map((row) => {
    const product = row.product_id
      ? productById.get(row.product_id)
      : undefined;
    const qty = Number(row.quantity);
    let error: string | null = null;
    if (!row.location_id) error = "Pilih lokasi";
    else if (!row.product_id) error = "Pilih produk";
    else if (!Number.isFinite(qty) || qty <= 0) error = "Qty min. 1";
    else if (!Number.isInteger(qty)) error = "Qty harus bilangan bulat";
    else if (product?.is_perishable && !row.produced_at) {
      error = "Tanggal produksi wajib diisi untuk perishable";
    } else if (
      product?.is_perishable &&
      !product.default_shelf_life_hours &&
      !row.expires_at
    ) {
      error = "Expiry wajib diisi (produk tanpa default shelf life)";
    }
    return { product, error };
  });

  const valid = items.length > 0 && rowsInfo.every((r) => r.error === null);

  const itemsJson = JSON.stringify(
    items
      .filter((i) => i.product_id && Number(i.quantity) > 0)
      .map((i) => {
        const product = productById.get(i.product_id);
        return {
          location_id: i.location_id,
          product_id: i.product_id,
          quantity: Number(i.quantity),
          produced_at:
            product?.is_perishable && i.produced_at
              ? localDateStartIso(i.produced_at)
              : product?.is_perishable
                ? new Date().toISOString()
                : null,
          expires_at:
            product?.is_perishable && i.expires_at
              ? new Date(i.expires_at).toISOString()
              : null,
          notes: i.notes.trim() || null,
        };
      }),
  );

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Item Stok Awal</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addRow}
            disabled={products.length === 0}
          >
            <Plus className="h-4 w-4" />
            Tambah item
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((row, idx) => {
            const info = rowsInfo[idx];
            const product = info.product;
            const isPerishable = product?.is_perishable ?? false;
            const hasShelfLife =
              isPerishable && Boolean(product?.default_shelf_life_hours);
            const expiryHint = isPerishable
              ? hasShelfLife
                ? `Otomatis: ${product?.default_shelf_life_hours} jam dari produksi`
                : "Wajib diisi (produk tanpa default)"
              : "Tidak berlaku";

            return (
              <div
                key={row.uid}
                className="grid gap-3 rounded-lg border bg-background/50 p-3 sm:grid-cols-[1fr_1fr_100px_1fr_1fr_auto] sm:items-start"
              >
                <FormField
                  label={`Lokasi ${idx + 1}`}
                  htmlFor={`loc-${row.uid}`}
                  error={row.location_id ? undefined : "Pilih lokasi"}
                >
                  <Select
                    id={`loc-${row.uid}`}
                    value={row.location_id}
                    onChange={(e) =>
                      updateRow(row.uid, { location_id: e.currentTarget.value })
                    }
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField
                  label={`Produk ${idx + 1}`}
                  htmlFor={`product-${row.uid}`}
                  error={info.error ?? undefined}
                >
                  <SearchSelect
                    id={`product-${row.uid}`}
                    value={row.product_id}
                    placeholder="Pilih produk"
                    searchPlaceholder="Cari produk…"
                    onChange={(e) =>
                      handleProductChange(row.uid, e.currentTarget.value)
                    }
                  >
                    <option value="" disabled>
                      Pilih produk
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}{" "}
                        {p.is_perishable ? "" : "(non-perishable)"}
                      </option>
                    ))}
                  </SearchSelect>
                </FormField>

                <FormField
                  label={`Qty${product?.unit ? ` (${product.unit})` : ""}`}
                  htmlFor={`qty-${row.uid}`}
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
                  label="Tgl. produksi"
                  htmlFor={`prod-${row.uid}`}
                  hint={isPerishable ? "Wajib" : "Opsional"}
                >
                  <Input
                    id={`prod-${row.uid}`}
                    type="date"
                    value={row.produced_at}
                    onChange={(e) =>
                      handleProducedAtChange(row.uid, e.currentTarget.value)
                    }
                    disabled={!isPerishable}
                  />
                </FormField>

                <FormField
                  label="Kedaluwarsa"
                  htmlFor={`expires-${row.uid}`}
                  hint={expiryHint}
                >
                  <Input
                    id={`expires-${row.uid}`}
                    type="datetime-local"
                    value={isPerishable ? row.expires_at : ""}
                    onChange={(e) =>
                      updateRow(row.uid, { expires_at: e.currentTarget.value })
                    }
                    disabled={!isPerishable}
                  />
                </FormField>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.uid)}
                  disabled={items.length === 1}
                  aria-label="Hapus baris"
                  className="sm:mt-7"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                {/* Notes — full width di bawah grid pada mobile, col 1-4 pada desktop */}
                <div className="col-span-full sm:col-span-4">
                  <FormField
                    label="Catatan (opsional)"
                    htmlFor={`notes-${row.uid}`}
                  >
                    <Textarea
                      id={`notes-${row.uid}`}
                      rows={1}
                      maxLength={500}
                      value={row.notes}
                      onChange={(e) =>
                        updateRow(row.uid, { notes: e.currentTarget.value })
                      }
                      placeholder="Misal: stok sisa dari sebelumnya"
                    />
                  </FormField>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <input type="hidden" name="items" value={itemsJson} />

      {state.itemErrors && state.itemErrors.length > 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="mb-1 text-sm font-medium text-destructive">
            Error pada beberapa item:
          </p>
          <ul className="list-inside list-disc text-sm text-destructive/80">
            {state.itemErrors.map((e) => (
              <li key={e.index}>
                Item #{e.index + 1}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.message ? (
        <p
          className={`text-sm ${
            state.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <span className="text-sm text-muted-foreground">
          {items.length} item akan dicatat
        </span>
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Menyimpan…" : `Catat ${items.length} item stok awal`}
        </Button>
      </div>
    </form>
  );
}
