"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { formatDate, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Item yang bisa diedit dari transfer existing.
 */
export type EditableItem = {
  id: string;
  source_batch_id: string;
  quantity: number;
};

type Batch = {
  id: string;
  product_id: string;
  produced_at: string;
  expires_at: string | null;
  remaining_qty: number;
  product: {
    sku: string;
    name: string;
    unit: string;
    is_perishable: boolean;
  } | null;
};

type Row = {
  uid: string;
  source_batch_id: string;
  quantity: string;
};

/**
 * Dialog edit item transfer pending. Logikanya:
 *
 *   1. Tampilkan items existing sebagai rows (qty editable, batch tetap bisa
 *      diganti ke batch lain dari lokasi yg sama).
 *   2. User boleh tambah/hapus row.
 *   3. Submit kirim seluruh items (rebuild di server — fn_update_transfer_items).
 *
 * Stok efektif yang tersedia per batch = remaining_qty + qty yang dipakai
 * row INI di transfer ini (karena server akan rebuild — qty lama dianggap
 * dikembalikan dulu ke batch).
 */
export function TransferEditItemsDialog({
  open,
  onOpenChange,
  transferId,
  fromLocationId,
  currentItems,
  action,
  pending,
  errorMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transferId: string;
  fromLocationId: string;
  currentItems: EditableItem[];
  action: (formData: FormData) => void;
  pending: boolean;
  errorMessage: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const idPrefix = useId();
  const counterRef = useRef(0);
  const nextUid = () => `${idPrefix}-${counterRef.current++}`;

  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);

  // Saat dialog dibuka, init rows dari currentItems.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(
      currentItems.map((it) => ({
        uid: nextUid(),
        source_batch_id: it.source_batch_id,
        quantity: String(it.quantity),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentItems]);

  // Fetch semua batch aktif di lokasi asal saat dialog terbuka.
  useEffect(() => {
    if (!open || !fromLocationId) return;
    let active = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setBatchLoading(true);
    setBatchError(null);
    void supabase
      .from("stock_batches")
      .select(
        "id, product_id, produced_at, expires_at, remaining_qty, product:products!inner(sku, name, unit, is_perishable)",
      )
      .eq("location_id", fromLocationId)
      // remaining_qty bisa 0 (kalau batch ini sedang dipakai full di transfer
      // ini sendiri); kita tetap tampilkan supaya user bisa pertahankan baris
      // existing tanpa server tolak.
      .gte("remaining_qty", 0)
      .order("produced_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setBatchError(error.message);
        else setBatches(((data ?? []) as unknown as Batch[]) ?? []);
        setBatchLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      active = false;
    };
  }, [open, supabase, fromLocationId]);

  const batchById = useMemo(() => {
    const map = new Map<string, Batch>();
    for (const b of batches) map.set(b.id, b);
    return map;
  }, [batches]);

  // Hitung qty yang dipakai per batch oleh row INI (untuk relax constraint
  // remaining_qty saat edit — server akan rebuild dengan rollback dulu).
  const currentByBatch = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of currentItems) {
      map.set(it.source_batch_id, (map.get(it.source_batch_id) ?? 0) + it.quantity);
    }
    return map;
  }, [currentItems]);

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { uid: nextUid(), source_batch_id: "", quantity: "" },
    ]);
  const removeRow = (uid: string) =>
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.uid !== uid) : prev,
    );
  const updateRow = (uid: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    );

  // Validasi client-side.
  const clientErrors = rows.map((row) => {
    if (!row.source_batch_id) return "Pilih batch";
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return "Qty min. 1";
    if (!Number.isInteger(qty)) return "Qty harus bilangan bulat";
    const batch = batchById.get(row.source_batch_id);
    if (batch) {
      // Available = remaining_qty saat ini + qty yang ROW LAIN sudah pakai
      // dari batch ini di transfer ini. Server akan rebuild, jadi kita
      // boleh "claim" balik qty existing.
      const claimedThisTransfer = currentByBatch.get(batch.id) ?? 0;
      const effectiveMax = Number(batch.remaining_qty) + claimedThisTransfer;
      if (qty > effectiveMax) {
        return `Maks ${formatNumber(effectiveMax)} ${batch.product?.unit ?? ""}`;
      }
    }
    return null;
  });

  const dupBatch = rows.some(
    (row, i) =>
      row.source_batch_id &&
      rows.findIndex((r) => r.source_batch_id === row.source_batch_id) !== i,
  );

  const valid =
    rows.length > 0 &&
    !dupBatch &&
    clientErrors.every((e) => e === null);

  const itemsJson = JSON.stringify(
    rows.map((r) => ({
      source_batch_id: r.source_batch_id,
      quantity: Number(r.quantity),
    })),
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit item transfer"
      description="Hanya tersedia saat status pending. Server akan menyesuaikan stok asal otomatis."
      className="max-w-3xl"
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={transferId} />
        <ItemsHidden itemsJson={itemsJson} />

        {batchError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {batchError}
          </p>
        ) : null}

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const err = clientErrors[idx];
            const batch = row.source_batch_id
              ? batchById.get(row.source_batch_id)
              : null;
            return (
              <div
                key={row.uid}
                className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[1fr_120px_auto]"
              >
                <FormField
                  label={`Batch ${idx + 1}`}
                  htmlFor={`batch-${row.uid}`}
                  error={err && err !== "Qty min. 1" && !err.startsWith("Maks") ? err : undefined}
                  required
                >
                  <Select
                    id={`batch-${row.uid}`}
                    value={row.source_batch_id}
                    onChange={(e) =>
                      updateRow(row.uid, {
                        source_batch_id: e.currentTarget.value,
                      })
                    }
                    disabled={batchLoading}
                  >
                    <option value="">Pilih batch</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.product?.name} · {formatNumber(b.remaining_qty)}{" "}
                        {b.product?.unit}
                        {b.product?.is_perishable && b.expires_at
                          ? ` · exp ${formatDate(b.expires_at)}`
                          : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField
                  label="Qty"
                  htmlFor={`qty-${row.uid}`}
                  error={
                    err && (err === "Qty min. 1" || err.startsWith("Maks"))
                      ? err
                      : undefined
                  }
                  required
                >
                  <Input
                    id={`qty-${row.uid}`}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(row.uid, { quantity: e.currentTarget.value })
                    }
                  />
                  {batch ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tersedia: {formatNumber(
                        Number(batch.remaining_qty) +
                          (currentByBatch.get(batch.id) ?? 0),
                      )}{" "}
                      {batch.product?.unit}
                    </p>
                  ) : null}
                </FormField>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.uid)}
                    disabled={rows.length <= 1}
                    aria-label="Hapus baris"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {dupBatch ? (
          <p className="text-xs text-destructive">
            Ada batch yang dipilih lebih dari sekali — gabungkan ke satu baris.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" />
            Tambah baris
          </Button>
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
          <Button type="submit" disabled={pending || !valid}>
            {pending ? "Menyimpan…" : "Simpan perubahan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Wrapper hidden input untuk JSON items — sebagai komponen agar React tidak
 * complain tentang controlled vs uncontrolled saat itemsJson berubah.
 */
function ItemsHidden({ itemsJson }: { itemsJson: string }) {
  return <input type="hidden" name="items" value={itemsJson} />;
}
