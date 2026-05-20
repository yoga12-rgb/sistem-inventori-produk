"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import {
  recordStockEntryAction,
} from "./actions";
import type { StockEntryFormState } from "./state";

type Product = { id: string; sku: string; name: string; unit: string };
type Location = { id: string; code: string; name: string };

const initialState: StockEntryFormState = { ok: false };

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StockEntryForm({
  products,
  locations,
  defaultLocationId,
}: {
  products: Product[];
  locations: Location[];
  defaultLocationId: string;
}) {
  const [state, action, pending] = useActionState(
    recordStockEntryAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Produk"
          htmlFor="product_id"
          required
          error={state.fieldErrors?.product_id}
          hint="Hanya produk non-perishable"
        >
          <Select id="product_id" name="product_id" required defaultValue="">
            <option value="" disabled>
              Pilih produk
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Lokasi"
          htmlFor="location_id"
          required
          error={state.fieldErrors?.location_id}
        >
          <Select
            id="location_id"
            name="location_id"
            defaultValue={defaultLocationId}
            required
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Kuantitas"
          htmlFor="quantity"
          required
          error={state.fieldErrors?.quantity}
        >
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            step="1"
            inputMode="numeric"
            required
          />
        </FormField>

        <FormField
          label="Tanggal & jam masuk"
          htmlFor="entered_at"
          required
          error={state.fieldErrors?.entered_at}
        >
          <Input
            id="entered_at"
            name="entered_at"
            type="datetime-local"
            defaultValue={toLocalInput(new Date())}
            required
          />
        </FormField>
      </div>

      <FormField label="Catatan" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} maxLength={500} />
      </FormField>

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
        <Button type="submit" disabled={pending || products.length === 0}>
          {pending ? "Menyimpan…" : "Catat stok masuk"}
        </Button>
      </div>
    </form>
  );
}
