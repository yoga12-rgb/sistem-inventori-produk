"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import {
  recordProductionBatchAction,
  type ProductionFormState,
} from "./actions";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  is_perishable: boolean;
  default_shelf_life_hours: number | null;
};

type Location = { id: string; code: string; name: string };

type LineItem = {
  uid: string;
  product_id: string;
  quantity: string;
  /** Expiry datetime-local string atau "" untuk auto-fill / non-perishable. */
  expires_at: string;
  /** Apakah user sudah edit expires_at manual (jangan auto-overwrite). */
  expires_touched: boolean;
};

const initialState: ProductionFormState = { ok: false };

function newUid(): string {
  return Math.random().toString(36).slice(2, 10);
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

export function ProductionForm({
  products,
  centralKitchens,
  defaultLocationId,
}: {
  products: Product[];
  centralKitchens: Location[];
  defaultLocationId: string;
}) {
  const [state, action, pending] = useActionState(
    recordProductionBatchAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [producedAt, setProducedAt] = useState<string>(toLocalInput(new Date()));
  const [items, setItems] = useState<LineItem[]>(() => [makeEmptyRow()]);

  function makeEmptyRow(): LineItem {
    return {
      uid: newUid(),
      product_id: "",
      quantity: "",
      expires_at: "",
      expires_touched: false,
    };
  }

  // Reset form setelah server action sukses.
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    /* eslint-disable react-hooks/set-state-in-effect */
    setProducedAt(toLocalInput(new Date()));
    setItems([makeEmptyRow()]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state]);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  // Re-compute expires_at otomatis untuk semua row yang belum di-touch
  // saat producedAt berubah. Pakai handler eksplisit (bukan useEffect)
  // supaya React lint tidak salah-deteksi sebagai cascading render.
  const handleProducedAtChange = (next: string) => {
    setProducedAt(next);
    setItems((prev) =>
      prev.map((row) => {
        if (row.expires_touched || !row.product_id) return row;
        const p = productById.get(row.product_id);
        if (!p?.is_perishable || !p.default_shelf_life_hours) return row;
        return {
          ...row,
          expires_at: addHoursLocal(next, p.default_shelf_life_hours),
        };
      }),
    );
  };

  const addRow = () => setItems((prev) => [...prev, makeEmptyRow()]);

  const removeRow = (uid: string) =>
    setItems((prev) =>
      prev.length > 1 ? prev.filter((i) => i.uid !== uid) : prev,
    );

  const updateRow = (uid: string, patch: Partial<LineItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)),
    );

  /**
   * Saat produk berubah, isi otomatis expires_at jika belum di-touch
   * dan produknya perishable + punya default shelf life.
   */
  const handleProductChange = (uid: string, productId: string) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.uid !== uid) return row;
        const p = productById.get(productId);
        const next: LineItem = {
          ...row,
          product_id: productId,
        };
        if (!row.expires_touched) {
          if (p?.is_perishable && p.default_shelf_life_hours) {
            next.expires_at = addHoursLocal(
              producedAt,
              p.default_shelf_life_hours,
            );
          } else {
            next.expires_at = "";
          }
        }
        return next;
      }),
    );
  };

  // Validasi per baris.
  const rowsInfo = items.map((row) => {
    const product = row.product_id ? productById.get(row.product_id) : undefined;
    const qty = Number(row.quantity);
    let error: string | null = null;
    if (!row.product_id) error = "Pilih produk";
    else if (!Number.isFinite(qty) || qty <= 0) error = "Qty min. 1";
    else if (!Number.isInteger(qty)) error = "Qty harus bilangan bulat";
    else if (
      product?.is_perishable &&
      !product.default_shelf_life_hours &&
      !row.expires_at
    ) {
      error = "Expiry wajib diisi (produk tanpa default shelf life)";
    }
    return { product, error };
  });

  const dupProduct = items.some(
    (row, i) =>
      row.product_id &&
      items.findIndex((r) => r.product_id === row.product_id) !== i,
  );

  const valid =
    items.length > 0 && rowsInfo.every((r) => r.error === null) && !dupProduct;

  const itemsJson = JSON.stringify(
    items
      .filter((i) => i.product_id && Number(i.quantity) > 0)
      .map((i) => {
        const product = productById.get(i.product_id);
        return {
          product_id: i.product_id,
          quantity: Number(i.quantity),
          // Hanya kirim expires_at untuk perishable. Non-perishable: null.
          expires_at:
            product?.is_perishable && i.expires_at
              ? new Date(i.expires_at).toISOString()
              : null,
        };
      }),
  );

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Lokasi"
          htmlFor="location_id"
          required
          error={state.fieldErrors?.location_id}
          hint="Hanya Central Pastry yang boleh produksi"
        >
          <Select
            id="location_id"
            name="location_id"
            defaultValue={defaultLocationId}
            required
          >
            {centralKitchens.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Tanggal & jam produksi"
          htmlFor="produced_at"
          required
          error={state.fieldErrors?.produced_at}
          hint="Berlaku untuk semua item di bawah"
        >
          <Input
            id="produced_at"
            name="produced_at"
            type="datetime-local"
            value={producedAt}
            onChange={(e) => handleProducedAtChange(e.currentTarget.value)}
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
            disabled={products.length === 0}
          >
            <Plus className="h-4 w-4" />
            Tambah varian
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
                ? `Default: ${product?.default_shelf_life_hours} jam dari produksi`
                : "Wajib diisi (produk tanpa default)"
              : "Tidak berlaku untuk non-perishable";

            return (
              <div
                key={row.uid}
                className="grid gap-3 rounded-lg border bg-background/50 p-3 sm:grid-cols-[2fr_120px_1fr_auto] sm:items-end"
              >
                <FormField
                  label={`Produk ${idx + 1}`}
                  htmlFor={`product-${row.uid}`}
                  error={info.error ?? undefined}
                >
                  <Select
                    id={`product-${row.uid}`}
                    value={row.product_id}
                    onChange={(e) =>
                      handleProductChange(row.uid, e.currentTarget.value)
                    }
                  >
                    <option value="">Pilih produk</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}{" "}
                        {p.is_perishable ? "" : "(non-perishable)"}
                      </option>
                    ))}
                  </Select>
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
                  label="Kedaluwarsa"
                  htmlFor={`expires-${row.uid}`}
                  hint={expiryHint}
                >
                  <Input
                    id={`expires-${row.uid}`}
                    type="datetime-local"
                    value={isPerishable ? row.expires_at : ""}
                    onChange={(e) =>
                      updateRow(row.uid, {
                        expires_at: e.currentTarget.value,
                        expires_touched: true,
                      })
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
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {dupProduct ? (
          <p className="text-sm text-destructive">
            Produk yang sama tidak boleh dipakai di dua baris. Gabungkan
            kuantitasnya saja.
          </p>
        ) : null}
      </div>

      <input type="hidden" name="items" value={itemsJson} />

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

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Menyimpan…" : `Catat ${items.length} batch`}
        </Button>
      </div>
    </form>
  );
}
