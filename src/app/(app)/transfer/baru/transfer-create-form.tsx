"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMasterData } from "@/components/master-data-provider";
import { createTransferAction } from "../actions";
import type { CreateTransferState } from "../state";

type Location = {
  id: string;
  code: string;
  name: string;
  type: "central_kitchen" | "outlet";
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

type LineItem = {
  uid: string;
  source_batch_id: string;
  quantity: string; // string karena masih dalam input
};

const initialState: CreateTransferState = { ok: false };

export function TransferCreateForm({
  allowedFromIds,
  defaultFromId,
}: {
  allowedFromIds: string[];
  defaultFromId: string | null;
}) {
  const master = useMasterData();
  const allowedSet = useMemo(() => new Set(allowedFromIds), [allowedFromIds]);
  const allowedFromLocations = useMemo(
    () => master.locations.filter((l) => allowedSet.has(l.id)),
    [master.locations, allowedSet],
  );
  const allLocations = master.locations;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, action, pending] = useActionState(
    createTransferAction,
    initialState,
  );

  // Stable id prefix + counter (deterministik antara SSR & CSR).
  // counterRef hanya dibaca dari event handler / effect (tidak boleh saat render).
  const idPrefix = useId();
  const counterRef = useRef(1); // 0 dipakai row awal.
  const nextUid = () => `${idPrefix}-${counterRef.current++}`;
  const makeEmptyRow = (uid: string = nextUid()): LineItem => ({
    uid,
    source_batch_id: "",
    quantity: "",
  });

  const [fromId, setFromId] = useState<string>(defaultFromId ?? "");
  const [toId, setToId] = useState<string>("");
  const [mode, setMode] = useState<"one_way" | "two_way">("two_way");
  const [items, setItems] = useState<LineItem[]>(() => [
    { uid: `${idPrefix}-0`, source_batch_id: "", quantity: "" },
  ]);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Ambil semua batch aktif di lokasi asal terpilih.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!fromId) {
      setBatches([]);
      return;
    }
    let active = true;
    setBatchLoading(true);
    setBatchError(null);
    void supabase
      .from("stock_batches")
      .select(
        "id, product_id, produced_at, expires_at, remaining_qty, product:products!inner(sku, name, unit, is_perishable)",
      )
      .eq("location_id", fromId)
      .gt("remaining_qty", 0)
      .order("produced_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setBatchError(error.message);
        else setBatches(((data ?? []) as unknown as Batch[]) ?? []);
        setBatchLoading(false);
      });
    return () => {
      active = false;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [supabase, fromId]);

  // Reset items saat asal berubah supaya tidak bawa batch dari outlet lama.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([makeEmptyRow()]);
  }, [fromId]);

  const batchById = useMemo(() => {
    const map = new Map<string, Batch>();
    for (const b of batches) map.set(b.id, b);
    return map;
  }, [batches]);

  const addRow = () => setItems((prev) => [...prev, makeEmptyRow()]);
  const removeRow = (uid: string) =>
    setItems((prev) =>
      prev.length > 1 ? prev.filter((i) => i.uid !== uid) : prev,
    );
  const updateRow = (uid: string, patch: Partial<LineItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)),
    );

  // Validasi sederhana di klien (sumber kebenaran tetap di server / DB).
  const clientErrors = items.map((row) => {
    if (!row.source_batch_id) return "Pilih batch";
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return "Qty min. 1";
    if (!Number.isInteger(qty)) return "Qty harus bilangan bulat";
    const batch = batchById.get(row.source_batch_id);
    if (batch && qty > Number(batch.remaining_qty)) {
      return `Maks ${formatNumber(batch.remaining_qty)} ${batch.product?.unit ?? ""}`;
    }
    return null;
  });

  const dupBatch = items.some(
    (row, i) =>
      row.source_batch_id &&
      items.findIndex((r) => r.source_batch_id === row.source_batch_id) !== i,
  );

  const valid =
    fromId &&
    toId &&
    fromId !== toId &&
    items.length > 0 &&
    clientErrors.every((e) => e === null) &&
    !dupBatch;

  const itemsJson = JSON.stringify(
    items
      .filter((i) => i.source_batch_id && Number(i.quantity) > 0)
      .map((i) => ({
        source_batch_id: i.source_batch_id,
        quantity: Number(i.quantity),
      })),
  );

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <FormField
          label="Dari outlet"
          htmlFor="from_location_id"
          required
          error={state.fieldErrors?.from_location_id}
        >
          <Select
            id="from_location_id"
            name="from_location_id"
            value={fromId}
            onChange={(e) => setFromId(e.currentTarget.value)}
            required
          >
            <option value="" disabled>
              Pilih asal
            </option>
            {allowedFromLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Ke outlet"
          htmlFor="to_location_id"
          required
          error={state.fieldErrors?.to_location_id}
        >
          <Select
            id="to_location_id"
            name="to_location_id"
            value={toId}
            onChange={(e) => setToId(e.currentTarget.value)}
            required
          >
            <option value="" disabled>
              Pilih tujuan
            </option>
            {allLocations
              .filter((l) => l.id !== fromId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
          </Select>
        </FormField>

        <FormField label="Mode" htmlFor="mode" required>
          <Select
            id="mode"
            name="mode"
            value={mode}
            onChange={(e) =>
              setMode(e.currentTarget.value as "one_way" | "two_way")
            }
          >
            <option value="two_way">Two-way (perlu konfirmasi)</option>
            <option value="one_way">One-way (langsung)</option>
          </Select>
        </FormField>
      </div>

      <FormField
        label="Catatan"
        htmlFor="notes"
        hint="Opsional. Misal: alasan transfer, kontak kurir."
      >
        <Textarea id="notes" name="notes" rows={2} maxLength={500} />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Item</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addRow}
            disabled={!fromId || batches.length === 0}
          >
            <Plus className="h-4 w-4" />
            Tambah baris
          </Button>
        </div>

        {!fromId ? (
          <p className="text-sm text-muted-foreground">
            Pilih lokasi asal terlebih dahulu.
          </p>
        ) : batchLoading ? (
          <p className="text-sm text-muted-foreground">Memuat batch…</p>
        ) : batchError ? (
          <p className="text-sm text-destructive">{batchError}</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tidak ada stok aktif di lokasi asal ini.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((row, idx) => {
              const batch = row.source_batch_id
                ? batchById.get(row.source_batch_id)
                : undefined;
              return (
                <div
                  key={row.uid}
                  className="grid gap-3 rounded-lg border bg-background/50 p-3 sm:grid-cols-[1fr_160px_auto] sm:items-start"
                >
                  <FormField
                    label={`Batch ${idx + 1}`}
                    htmlFor={`batch-${row.uid}`}
                    error={clientErrors[idx] ?? undefined}
                  >
                    <Select
                      id={`batch-${row.uid}`}
                      value={row.source_batch_id}
                      onChange={(e) =>
                        updateRow(row.uid, {
                          source_batch_id: e.currentTarget.value,
                        })
                      }
                    >
                      <option value="">Pilih batch</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.product?.sku} — {b.product?.name} · sisa{" "}
                          {formatNumber(b.remaining_qty)} {b.product?.unit}
                          {b.product?.is_perishable && b.expires_at
                            ? ` · exp ${formatDate(b.expires_at)}`
                            : ""}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField
                    label={`Qty${batch?.product?.unit ? ` (${batch.product.unit})` : ""}`}
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
                </div>
              );
            })}
          </div>
        )}

        {dupBatch ? (
          <p className="text-sm text-destructive">
            Batch yang sama tidak boleh dipakai di dua baris.
          </p>
        ) : null}
      </div>

      <input type="hidden" name="items" value={itemsJson} />

      {state.message && !state.ok ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Menyimpan…" : "Buat transfer"}
        </Button>
      </div>
    </form>
  );
}
