"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Pencil,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/format";
import {
  cancelTransferAction,
  confirmTransferAction,
  rejectTransferAction,
  shipTransferAction,
  updateTransferItemsAction,
} from "../actions";
import type { RpcState } from "../state";
import { TransferEditItemsDialog, type EditableItem } from "./edit-items-dialog";

const initialState: RpcState = { ok: false };

export type ConfirmableItem = {
  id: string;
  product: { sku: string; name: string; unit: string } | null;
  quantity: number;
};

export function TransferActions({
  id,
  status,
  mode,
  canSend,
  canReceive,
  isAdmin,
  items,
  fromLocationId,
  editableItems,
}: {
  id: string;
  status: string;
  mode: "one_way" | "two_way";
  canSend: boolean;
  canReceive: boolean;
  isAdmin: boolean;
  items: ConfirmableItem[];
  fromLocationId: string;
  editableItems: EditableItem[];
}) {
  const showShip =
    mode === "two_way" && status === "pending" && (canSend || isAdmin);
  const showCancel =
    (status === "pending" || status === "in_transit") && (canSend || isAdmin);
  const showConfirm =
    mode === "two_way" &&
    (status === "pending" || status === "in_transit") &&
    (canReceive || isAdmin);
  const showReject =
    mode === "two_way" &&
    (status === "pending" || status === "in_transit") &&
    (canReceive || isAdmin);
  const showEdit =
    status === "pending" && (canSend || isAdmin);

  if (
    !showShip &&
    !showCancel &&
    !showConfirm &&
    !showReject &&
    !showEdit
  )
    return null;

  return (
    <div className="flex flex-wrap gap-2">
      {showEdit ? (
        <EditButton
          id={id}
          fromLocationId={fromLocationId}
          items={editableItems}
        />
      ) : null}
      {showShip ? <ShipButton id={id} /> : null}
      {showConfirm ? <ConfirmButton id={id} items={items} /> : null}
      {showReject ? <RejectButton id={id} /> : null}
      {showCancel ? (
        <CancelButton id={id} status={status} />
      ) : null}
    </div>
  );
}

function ShipButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    shipTransferAction,
    initialState,
  );
  return (
    <form action={action} className="contents">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending}>
        <Send className="h-4 w-4" />
        Tandai dikirim
      </Button>
      {state.message && !state.ok ? (
        <span className="text-xs text-destructive">{state.message}</span>
      ) : null}
    </form>
  );
}

/**
 * Konfirmasi terima: modal dengan input qty per item.
 *
 * Default qty = quantity asli (utuh). User boleh kurangi → selisih jadi
 * 'transfer_loss' di lokasi asal. Wajib alasan kalau ada selisih.
 */
function ConfirmButton({
  id,
  items,
}: {
  id: string;
  items: ConfirmableItem[];
}) {
  const [open, setOpen] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState(
    confirmTransferAction,
    initialState,
  );

  // Reset state saat dialog dibuka.
  useEffect(() => {
    if (!open) return;
    const initialQtys: Record<string, string> = {};
    const initialReasons: Record<string, string> = {};
    for (const it of items) {
      initialQtys[it.id] = String(it.quantity);
      initialReasons[it.id] = "";
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQtys(initialQtys);
    setReasons(initialReasons);
  }, [open, items]);

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  const itemsWithDiff = useMemo(
    () =>
      items.map((it) => {
        const received = Math.max(
          0,
          Math.min(it.quantity, Math.floor(Number(qtys[it.id] ?? it.quantity) || 0)),
        );
        return {
          ...it,
          received,
          loss: it.quantity - received,
          reason: reasons[it.id] ?? "",
        };
      }),
    [items, qtys, reasons],
  );

  const totalLoss = itemsWithDiff.reduce((s, x) => s + x.loss, 0);
  const hasMissingReason = itemsWithDiff.some(
    (x) => x.loss > 0 && x.reason.trim().length === 0,
  );

  // Build payload untuk action.
  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        itemsWithDiff.map((x) => ({
          item_id: x.id,
          received_qty: x.received,
          loss_reason: x.reason.trim() || null,
        })),
      ),
    [itemsWithDiff],
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-4 w-4" />
        Konfirmasi diterima
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Konfirmasi terima"
        description="Sesuaikan qty kalau ada barang yang tidak sampai/rusak. Default = utuh."
        className="max-w-2xl"
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="items" value={itemsJson} />

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Produk</th>
                  <th className="px-3 py-2 text-right">Dikirim</th>
                  <th className="px-3 py-2 text-right">Diterima</th>
                  <th className="px-3 py-2 text-left">Alasan susut</th>
                </tr>
              </thead>
              <tbody>
                {itemsWithDiff.map((x) => (
                  <tr key={x.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {x.product?.name ?? "—"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {x.product?.sku}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(x.quantity)}{" "}
                      <span className="text-xs text-muted-foreground">
                        {x.product?.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={x.quantity}
                        step={1}
                        value={qtys[x.id] ?? ""}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setQtys((prev) => ({
                            ...prev,
                            [x.id]: value,
                          }));
                        }}
                        className="h-9 w-24 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        placeholder={
                          x.loss > 0 ? "Wajib jika ada susut" : "—"
                        }
                        value={x.reason}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setReasons((prev) => ({
                            ...prev,
                            [x.id]: value,
                          }));
                        }}
                        className="h-9"
                        disabled={x.loss === 0}
                        maxLength={300}
                      />
                      {x.loss > 0 ? (
                        <p className="mt-0.5 text-xs text-warning">
                          Susut {formatNumber(x.loss)} {x.product?.unit}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalLoss > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
              <p>
                Total {formatNumber(totalLoss)} unit akan dicatat sebagai{" "}
                <strong>susut transit</strong> di lokasi asal. Selisih ini
                tidak masuk stok tujuan.
              </p>
            </div>
          ) : null}

          {state.message && !state.ok ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Tutup
            </Button>
            <Button
              type="submit"
              disabled={pending || hasMissingReason}
              title={
                hasMissingReason
                  ? "Isi alasan untuk setiap item yang ada susut"
                  : undefined
              }
            >
              {pending ? "Memproses…" : "Konfirmasi terima"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function CancelButton({ id, status }: { id: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [state, action, pending] = useActionState(
    cancelTransferAction,
    initialState,
  );

  const isInTransit = status === "in_transit";
  const requiresStrongConfirm = isInTransit;

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirm("");
  }, [open]);

  const canSubmit =
    !pending &&
    (!requiresStrongConfirm || confirm.trim().toUpperCase() === "BATAL");

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4" />
        Batalkan
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Batalkan transfer"
        description={
          isInTransit
            ? "Transfer ini sudah dikirim — barang mungkin sedang di jalan."
            : "Stok di lokasi asal akan dikembalikan ke batch sumber."
        }
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />

          {isInTransit ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">
                    Status sudah <code>in_transit</code>.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pastikan barang fisik sudah kembali atau belum berangkat.
                    Stok asal akan ditambahkan kembali — bisa menyebabkan
                    overstock kalau barang tetap dikirim. Lebih disarankan
                    minta penerima menolak (Reject).
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">
                  Ketik <code className="rounded bg-muted px-1">BATAL</code>{" "}
                  untuk konfirmasi
                </label>
                <Input
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                  className="mt-1 h-9"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tindakan ini tidak dapat diurungkan. Movement penyesuaian akan
              dicatat di riwayat.
            </p>
          )}

          {state.message && !state.ok ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Tutup
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
            >
              {pending ? "Memproses…" : "Ya, batalkan"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function RejectButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    rejectTransferAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <X className="h-4 w-4" />
        Tolak
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Tolak transfer"
        description="Stok di lokasi asal akan dikembalikan."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <FormField label="Alasan (opsional)" htmlFor="reason">
            <Textarea id="reason" name="reason" rows={3} maxLength={500} />
          </FormField>
          {state.message && !state.ok ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Tutup
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Memproses…" : "Tolak transfer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function EditButton({
  id,
  fromLocationId,
  items,
}: {
  id: string;
  fromLocationId: string;
  items: EditableItem[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    updateTransferItemsAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit item
      </Button>
      <TransferEditItemsDialog
        open={open}
        onOpenChange={setOpen}
        transferId={id}
        fromLocationId={fromLocationId}
        currentItems={items}
        action={action}
        pending={pending}
        errorMessage={state.message && !state.ok ? state.message : null}
      />
    </>
  );
}
