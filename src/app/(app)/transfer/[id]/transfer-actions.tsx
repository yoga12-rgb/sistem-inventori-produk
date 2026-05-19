"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Send, CheckCircle2, X, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import {
  cancelTransferAction,
  confirmTransferAction,
  rejectTransferAction,
  shipTransferAction,
} from "../actions";
import type { RpcState } from "../state";

const initialState: RpcState = { ok: false };

export function TransferActions({
  id,
  status,
  mode,
  canSend,
  canReceive,
  isAdmin,
}: {
  id: string;
  status: string;
  mode: "one_way" | "two_way";
  canSend: boolean;
  canReceive: boolean;
  isAdmin: boolean;
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

  if (!showShip && !showCancel && !showConfirm && !showReject) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {showShip ? <ShipButton id={id} /> : null}
      {showConfirm ? <ConfirmButton id={id} /> : null}
      {showReject ? <RejectButton id={id} /> : null}
      {showCancel ? <CancelButton id={id} /> : null}
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

function ConfirmButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    confirmTransferAction,
    initialState,
  );
  return (
    <form action={action} className="contents">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending}>
        <CheckCircle2 className="h-4 w-4" />
        Konfirmasi diterima
      </Button>
      {state.message && !state.ok ? (
        <span className="text-xs text-destructive">{state.message}</span>
      ) : null}
    </form>
  );
}

function CancelButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    cancelTransferAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setOpen(false);
    }
  }, [state]);

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
        description="Stok di lokasi asal akan dikembalikan ke batch sumber."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-muted-foreground">
            Tindakan ini tidak dapat diurungkan. Movement penyesuaian akan
            dicatat di riwayat.
          </p>
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
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
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
