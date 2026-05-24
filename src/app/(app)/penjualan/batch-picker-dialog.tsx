"use client";

import { useEffect, useState } from "react";
import { Layers, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatNumber, hoursBetween } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BatchOption = {
  id: string;
  produced_at: string;
  expires_at: string | null;
  remaining_qty: number;
};

export type SplitDraft = {
  batch_id: string | null;
  quantity: number;
};

/**
 * Modal pilih distribusi batch untuk satu line cart.
 * Mode FEFO: 1 split dengan batch_id=null + qty total.
 * Mode Manual: n split dengan batch_id terisi & qty masing-masing.
 */
export function BatchPickerDialog({
  open,
  onOpenChange,
  productName,
  unit,
  isPerishable,
  expiryWarningHours,
  batches,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  unit: string;
  isPerishable: boolean;
  expiryWarningHours: number;
  batches: BatchOption[];
  current: SplitDraft[];
  onSave: (splits: SplitDraft[]) => void;
}) {
  const isCurrentManual =
    current.length > 0 && current.every((s) => s.batch_id !== null);

  const [mode, setMode] = useState<"fifo" | "manual">(
    isCurrentManual ? "manual" : "fifo",
  );

  // FEFO state.
  const initialFifoQty =
    current.length === 1 && current[0].batch_id === null
      ? current[0].quantity
      : current.reduce((sum, s) => sum + s.quantity, 0) || 1;
  const [fifoQty, setFifoQty] = useState<number>(initialFifoQty);

  // Manual state: map batch_id -> qty (string supaya kosong tampak sebagai 0).
  const [manualQty, setManualQty] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (isCurrentManual) {
      for (const s of current) {
        if (s.batch_id) map[s.batch_id] = String(s.quantity);
      }
    }
    return map;
  });

  // Reset state setiap modal dibuka ulang dengan nilai current baru.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setMode(isCurrentManual ? "manual" : "fifo");
    setFifoQty(initialFifoQty);
    const map: Record<string, string> = {};
    if (isCurrentManual) {
      for (const s of current) {
        if (s.batch_id) map[s.batch_id] = String(s.quantity);
      }
    }
    setManualQty(map);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, isCurrentManual, initialFifoQty, current]);

  const totalAvailable = batches.reduce(
    (sum, b) => sum + Number(b.remaining_qty),
    0,
  );

  // Manual validation: qty per batch ≤ remaining, total > 0.
  const manualSplits: SplitDraft[] = batches
    .map((b) => ({
      batch_id: b.id,
      quantity: Math.max(0, Math.floor(Number(manualQty[b.id]) || 0)),
    }))
    .filter((s) => s.quantity > 0);

  const manualTotal = manualSplits.reduce((s, x) => s + x.quantity, 0);
  const manualOver = manualSplits.some((s) => {
    const b = batches.find((x) => x.id === s.batch_id);
    return b ? s.quantity > Number(b.remaining_qty) : true;
  });

  const fifoQtyValid = fifoQty > 0 && fifoQty <= totalAvailable;
  const manualValid = manualTotal > 0 && !manualOver;
  const valid = mode === "fifo" ? fifoQtyValid : manualValid;

  function handleSave() {
    if (!valid) return;
    if (mode === "fifo") {
      onSave([{ batch_id: null, quantity: fifoQty }]);
    } else {
      onSave(manualSplits);
    }
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Distribusi batch — ${productName}`}
      description={`Total stok ${formatNumber(totalAvailable)} ${unit}. Pilih FEFO untuk pemotongan otomatis dari batch paling cepat expired, atau Manual untuk menentukan qty per batch.`}
      className="max-w-xl"
    >
      <div className="space-y-4">
        {/* Toggle FEFO / Manual */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setMode("fifo")}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "fifo"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="h-4 w-4" />
            Otomatis (FEFO)
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "manual"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="h-4 w-4" />
            Pilih batch manual
          </button>
        </div>

        {mode === "fifo" ? (
          <FifoPanel
            batches={batches}
            unit={unit}
            isPerishable={isPerishable}
            expiryWarningHours={expiryWarningHours}
            qty={fifoQty}
            onChangeQty={setFifoQty}
            totalAvailable={totalAvailable}
            valid={fifoQtyValid}
          />
        ) : (
          <ManualPanel
            batches={batches}
            unit={unit}
            isPerishable={isPerishable}
            expiryWarningHours={expiryWarningHours}
            manualQty={manualQty}
            onChangeQty={(id, v) =>
              setManualQty((prev) => ({ ...prev, [id]: v }))
            }
            total={manualTotal}
            invalid={manualOver}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleSave} disabled={!valid}>
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- FEFO panel -----------------------------------------------------------

function FifoPanel({
  batches,
  unit,
  isPerishable,
  expiryWarningHours,
  qty,
  onChangeQty,
  totalAvailable,
  valid,
}: {
  batches: BatchOption[];
  unit: string;
  isPerishable: boolean;
  expiryWarningHours: number;
  qty: number;
  onChangeQty: (qty: number) => void;
  totalAvailable: number;
  valid: boolean;
}) {
  // Hitung simulasi pemotongan FEFO untuk preview.
  const preview: { batch: BatchOption; take: number }[] = [];
  let remaining = qty;
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(b.remaining_qty));
    if (take > 0) preview.push({ batch: b, take });
    remaining -= take;
  }

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Total qty ({unit})
        </span>
        <Input
          type="number"
          min={1}
          step="1"
          inputMode="numeric"
          value={qty || ""}
          onChange={(e) => onChangeQty(Math.floor(Number(e.currentTarget.value) || 0))}
        />
        {!valid ? (
          <span className="text-xs text-destructive">
            {qty <= 0
              ? "Qty minimal 1"
              : `Stok hanya ${formatNumber(totalAvailable)} ${unit}`}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Sistem akan memotong dari batch paling cepat expired dulu (FEFO).
          </span>
        )}
      </label>

      {preview.length > 0 ? (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pratinjau pemotongan
          </div>
          <ul className="space-y-1 text-sm">
            {preview.map(({ batch, take }) => {
              const expSoon =
                isPerishable &&
                batch.expires_at &&
                hoursBetween(new Date(), batch.expires_at) <=
                  expiryWarningHours;
              return (
                <li
                  key={batch.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    Batch tgl {formatDate(batch.produced_at)}
                    {isPerishable && batch.expires_at ? (
                      <span
                        className={cn(
                          "ml-2 text-xs",
                          expSoon
                            ? "text-warning"
                            : "text-muted-foreground",
                        )}
                      >
                        exp {formatDate(batch.expires_at)}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatNumber(take)} {unit}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// --- Manual panel ---------------------------------------------------------

function ManualPanel({
  batches,
  unit,
  isPerishable,
  expiryWarningHours,
  manualQty,
  onChangeQty,
  total,
  invalid,
}: {
  batches: BatchOption[];
  unit: string;
  isPerishable: boolean;
  expiryWarningHours: number;
  manualQty: Record<string, string>;
  onChangeQty: (batchId: string, value: string) => void;
  total: number;
  invalid: boolean;
}) {
  if (batches.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
        Tidak ada batch aktif untuk produk ini.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {batches.map((b) => {
          const expSoon =
            isPerishable &&
            b.expires_at &&
            hoursBetween(new Date(), b.expires_at) <= expiryWarningHours;
          const remaining = Number(b.remaining_qty);
          const value = manualQty[b.id] ?? "";
          const num = Math.max(0, Math.floor(Number(value) || 0));
          const over = num > remaining;
          return (
            <li
              key={b.id}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                num > 0
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-background/40",
                over && "border-destructive/60 bg-destructive/5",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    Batch tgl {formatDate(b.produced_at)}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Sisa{" "}
                      <span className="font-medium tabular-nums text-foreground">
                        {formatNumber(remaining)}
                      </span>{" "}
                      {unit}
                    </span>
                    {isPerishable && b.expires_at ? (
                      <span
                        className={cn(
                          expSoon &&
                            "rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning",
                        )}
                      >
                        Exp {formatDate(b.expires_at)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step="1"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => onChangeQty(b.id, e.currentTarget.value)}
                    placeholder="0"
                    className="h-9 w-20 text-right tabular-nums"
                  />
                  {over ? (
                    <span className="text-[11px] text-destructive">
                      Maks {formatNumber(remaining)}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div
        className={cn(
          "flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm",
          invalid && "border-destructive/40 text-destructive",
          total === 0 && "text-muted-foreground",
        )}
      >
        <span className="font-medium">Total</span>
        <span className="tabular-nums">
          {formatNumber(total)} {unit}
        </span>
      </div>
    </div>
  );
}
