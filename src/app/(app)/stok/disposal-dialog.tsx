"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordDisposalAction, type DisposalState } from "./actions";

type Batch = {
  id: string;
  produced_at: string;
  expires_at: string | null;
  remaining_qty: number;
};

const initialState: DisposalState = { ok: false };

export function DisposalDialog({
  productId,
  locationId,
  productName,
  locationLabel,
  unit,
  isPerishable,
}: {
  productId: string;
  locationId: string;
  productName: string;
  locationLabel: string;
  unit: string;
  isPerishable: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [state, action, pending] = useActionState(
    recordDisposalAction,
    initialState,
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    void supabase
      .from("stock_batches")
      .select("id, produced_at, expires_at, remaining_qty")
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .gt("remaining_qty", 0)
      .order("produced_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setBatches(((data ?? []) as Batch[]) ?? []);
        setLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      active = false;
    };
  }, [open, supabase, productId, locationId]);

  // Tutup modal otomatis setelah sukses.
  useEffect(() => {
    if (!state.ok) return;
    const t = setTimeout(() => setOpen(false), 800);
    return () => clearTimeout(t);
  }, [state]);

  const totalAvailable = batches.reduce(
    (sum, b) => sum + Number(b.remaining_qty),
    0,
  );

  return (
    <>
      <Button variant="ghost" size="sm" title="Buang stok" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Buang
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Buang stok — ${productName}`}
        description={`Lokasi ${locationLabel}. Total tersedia ${formatNumber(totalAvailable)} ${unit}.`}
      >
      <form action={action} className="space-y-4">
        <input type="hidden" name="product_id" value={productId} />
        <input type="hidden" name="location_id" value={locationId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Alasan" htmlFor="movement_type" required>
            <Select
              id="movement_type"
              name="movement_type"
              defaultValue={isPerishable ? "expired_out" : "damage_out"}
              required
            >
              {isPerishable ? (
                <option value="expired_out">Expired</option>
              ) : null}
              <option value="damage_out">Rusak / waste</option>
              <option value="adjustment_out">Penyesuaian (selisih)</option>
            </Select>
          </FormField>

          <FormField
            label={`Qty (${unit})`}
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
        </div>

        <FormField
          label="Batch"
          htmlFor="batch_id"
          hint="Kosong = FIFO otomatis (batch tertua dulu)"
        >
          <Select
            id="batch_id"
            name="batch_id"
            defaultValue=""
            disabled={loading || batches.length === 0}
          >
            <option value="">Otomatis (FIFO)</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                Tgl {formatDate(b.produced_at)} · sisa{" "}
                {formatNumber(b.remaining_qty)} {unit}
                {isPerishable && b.expires_at
                  ? ` · exp ${formatDate(b.expires_at)}`
                  : ""}
              </option>
            ))}
          </Select>
        </FormField>

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

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || batches.length === 0}
          >
            {pending ? "Memproses…" : "Buang stok"}
          </Button>
        </div>
      </form>
      </Modal>
    </>
  );
}
