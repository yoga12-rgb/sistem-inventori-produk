"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast, type ToastVariant } from "@/components/ui/toast";

type TransferStatus =
  | "pending"
  | "in_transit"
  | "received"
  | "cancelled"
  | "rejected";

type TransferRow = {
  id: string;
  code: string;
  mode: "one_way" | "two_way";
  status: TransferStatus;
  from_location_id: string;
  to_location_id: string;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
};

const POLL_INTERVAL_MS = 30_000;

type Direction = "incoming" | "outgoing";

type NotifyKind =
  | "incoming_new"
  | "incoming_shipped"
  | "outgoing_received"
  | "outgoing_rejected"
  | "outgoing_cancelled";

const NOTIFY_TEMPLATES: Record<
  NotifyKind,
  { title: string; describe: (code: string) => string; variant: ToastVariant }
> = {
  incoming_new: {
    title: "Transfer baru masuk",
    describe: (code) => `Kode ${code} menunggu konfirmasi.`,
    variant: "info",
  },
  incoming_shipped: {
    title: "Transfer dikirim",
    describe: (code) => `Kode ${code} sedang dalam perjalanan.`,
    variant: "info",
  },
  outgoing_received: {
    title: "Transfer diterima",
    describe: (code) => `Kode ${code} telah dikonfirmasi penerima.`,
    variant: "success",
  },
  outgoing_rejected: {
    title: "Transfer ditolak",
    describe: (code) => `Kode ${code} ditolak — stok dikembalikan.`,
    variant: "warning",
  },
  outgoing_cancelled: {
    title: "Transfer dibatalkan",
    describe: (code) => `Kode ${code} dibatalkan — stok dikembalikan.`,
    variant: "warning",
  },
};

/**
 * Mendengarkan dua arah transfer untuk outlet user dan memunculkan toast
 * dengan tombol aksi yang menavigasi ke detail transfer.
 *
 * Strategi ganda:
 *   1. Realtime channel `postgres_changes` (preferred di production).
 *   2. Polling fallback tiap 30s (di lokal yang `[realtime] enabled = false`).
 *
 * Toast dipicu untuk:
 *   • INCOMING (to_location_id = outlet user)
 *     - status pending/in_transit baru / berubah ke status itu.
 *   • OUTGOING (from_location_id = outlet user)
 *     - status berubah ke received  → "Transfer diterima"
 *     - status berubah ke rejected  → "Transfer ditolak"
 *     - status berubah ke cancelled → "Transfer dibatalkan"
 *
 * Catatan: pengirim juga "menjadi aktor" saat klik Cancel sendiri. Dia
 * tetap dapat toast — itu konfirmasi visual bahwa aksi sukses.
 */
export function TransferNotifier({
  myOutletId,
  myUserId,
}: {
  myOutletId: string;
  myUserId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const toast = useToast();

  const toastRef = useRef(toast);
  const routerRef = useRef(router);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!myOutletId) return;

    // Anti-duplikat per (id, kind). Channel realtime + polling bisa
    // sama-sama mendengar event yang sama; set ini menghindari toast ganda.
    const seen = new Set<string>();

    function notify(t: TransferRow, kind: NotifyKind) {
      const key = `${t.id}:${kind}`;
      if (seen.has(key)) return;
      seen.add(key);

      const tpl = NOTIFY_TEMPLATES[kind];
      const fn =
        tpl.variant === "success"
          ? toastRef.current.success
          : tpl.variant === "warning"
            ? toastRef.current.warning
            : tpl.variant === "error"
              ? toastRef.current.error
              : toastRef.current.info;
      fn(tpl.title, {
        description: tpl.describe(t.code),
        action: { label: "Lihat", href: `/transfer/${t.id}` },
      });
      routerRef.current.prefetch(`/transfer/${t.id}`);
    }

    function classifyIncomingInsert(t: TransferRow): NotifyKind | null {
      if (t.status === "pending" || t.status === "in_transit") {
        return "incoming_new";
      }
      return null;
    }

    function classifyIncomingUpdate(
      t: TransferRow,
      prev: Partial<TransferRow>,
    ): NotifyKind | null {
      const statusChanged = prev.status !== t.status;
      if (
        statusChanged &&
        (t.status === "pending" || t.status === "in_transit")
      ) {
        return "incoming_shipped";
      }
      return null;
    }

    function classifyOutgoingUpdate(
      t: TransferRow,
      prev: Partial<TransferRow>,
    ): NotifyKind | null {
      if (prev.status === t.status) return null;
      if (t.status === "received") return "outgoing_received";
      if (t.status === "rejected") return "outgoing_rejected";
      if (t.status === "cancelled") return "outgoing_cancelled";
      return null;
    }

    // -------- 1. Realtime channels ----------------------------------
    const inboxChannel = supabase
      .channel(`transfer-inbox-${myOutletId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transfers",
          filter: `to_location_id=eq.${myOutletId}`,
        },
        (payload: {
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          const t = payload.new as unknown as TransferRow;
          const kind = classifyIncomingInsert(t);
          if (kind) notify(t, kind);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transfers",
          filter: `to_location_id=eq.${myOutletId}`,
        },
        (payload: {
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          const t = payload.new as unknown as TransferRow;
          const prev = payload.old as unknown as Partial<TransferRow>;
          const kind = classifyIncomingUpdate(t, prev);
          if (kind) notify(t, kind);
        },
      )
      .subscribe();

    const outboxChannel = supabase
      .channel(`transfer-outbox-${myOutletId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transfers",
          filter: `from_location_id=eq.${myOutletId}`,
        },
        (payload: {
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          const t = payload.new as unknown as TransferRow;
          const prev = payload.old as unknown as Partial<TransferRow>;
          const kind = classifyOutgoingUpdate(t, prev);
          if (kind) notify(t, kind);
        },
      )
      .subscribe();

    // -------- 2. Polling fallback -----------------------------------
    let lastSeenAt = new Date().toISOString();
    // Lacak status sebelumnya per transfer ID untuk mendeteksi perubahan
    // ke cancelled/rejected (yang tidak punya kolom timestamp khusus).
    const prevStatus = new Map<string, string>();

    async function pollDirection(direction: Direction) {
      const filter =
        direction === "incoming"
          ? {
              eq: { to_location_id: myOutletId },
              statuses: ["pending", "in_transit"],
            }
          : {
              eq: { from_location_id: myOutletId },
              statuses: ["received", "rejected", "cancelled"],
            };

      let q = supabase
        .from("transfers")
        .select(
          "id, code, mode, status, from_location_id, to_location_id, created_at, shipped_at, received_at",
        )
        .in("status", filter.statuses);

      for (const [k, v] of Object.entries(filter.eq)) {
        q = q.eq(k, v);
      }

      // Geser apa yang baru: bandingkan watermark ke kolom yang relevan
      // per status, lalu klasifikasikan event-nya.
      q = q
        .or(
          [
            `created_at.gt.${lastSeenAt}`,
            `shipped_at.gt.${lastSeenAt}`,
            `received_at.gt.${lastSeenAt}`,
          ].join(","),
        )
        .limit(20);

      const { data, error } = await q;
      if (error || !data) return;

      for (const row of data as TransferRow[]) {
        if (direction === "incoming") {
          if (row.created_at > lastSeenAt && row.status === "pending") {
            notify(row, "incoming_new");
          } else if (
            row.shipped_at &&
            row.shipped_at > lastSeenAt &&
            row.status === "in_transit"
          ) {
            notify(row, "incoming_shipped");
          }
        } else {
          if (row.received_at && row.received_at > lastSeenAt) {
            if (row.status === "received") notify(row, "outgoing_received");
          }
        }
      }

      // Geser watermark.
      for (const row of data as TransferRow[]) {
        if (row.created_at > lastSeenAt) lastSeenAt = row.created_at;
        if (row.shipped_at && row.shipped_at > lastSeenAt) {
          lastSeenAt = row.shipped_at;
        }
        if (row.received_at && row.received_at > lastSeenAt) {
          lastSeenAt = row.received_at;
        }
      }

      // Deteksi perubahan ke cancelled/rejected via status diff.
      // Ambil semua transfer outgoing (tidak dibatasi watermark) untuk
      // membandingkan status saat ini dengan status sebelumnya.
      if (direction === "outgoing") {
        const { data: allOutgoing } = await supabase
          .from("transfers")
          .select(
            "id, code, mode, status, from_location_id, to_location_id, created_at, shipped_at, received_at",
          )
          .eq("from_location_id", myOutletId)
          .in("status", ["received", "rejected", "cancelled"])
          .limit(50);

        for (const row of (allOutgoing ?? []) as TransferRow[]) {
          const before = prevStatus.get(row.id);
          if (before && before !== row.status) {
            if (row.status === "rejected") notify(row, "outgoing_rejected");
            else if (row.status === "cancelled")
              notify(row, "outgoing_cancelled");
          }
          prevStatus.set(row.id, row.status);
        }
      }
    }

    async function poll() {
      await Promise.all([pollDirection("incoming"), pollDirection("outgoing")]);
    }

    const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      void supabase.removeChannel(inboxChannel);
      void supabase.removeChannel(outboxChannel);
      clearInterval(pollTimer);
    };
  }, [supabase, myOutletId, myUserId]);

  return null;
}
