"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { voidSaleAction } from "./actions";

export type SaleHistoryRow = {
  id: string;
  occurred_at: string;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by_id: string | null;
  location: { id: string; code: string; name: string } | null;
  items: { quantity: number; product: { name: string; unit: string } | null }[];
  created_by: { full_name: string } | null;
};

const TZ_OFFSET = "+07:00"; // Asia/Jakarta

function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  base.setDate(base.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

function dayRangeIso(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00${TZ_OFFSET}`);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: start.toISOString(), end: next.toISOString() };
}

function formatHumanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const DATE_KEY = "penjualan-history:date";

/**
 * Cek izin pembatalan client-side (cosmetic — RLS server-side tetap final).
 *   - Super admin: bebas.
 *   - Kasir: hanya transaksi sendiri di outletnya, hari yang sama.
 */
function canVoid(
  row: SaleHistoryRow,
  ctx: { isAdmin: boolean; userId: string | null; outletId: string | null },
): boolean {
  if (row.voided_at) return false;
  if (ctx.isAdmin) return true;
  if (!ctx.userId) return false;
  if (row.created_by_id !== ctx.userId) return false;
  if (ctx.outletId && row.location?.id !== ctx.outletId) return false;
  // Hari yang sama (Asia/Jakarta).
  const today = todayLocalIso();
  const occurredJakarta = new Date(row.occurred_at).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Jakarta" },
  );
  return occurredJakarta === today;
}

/**
 * Panel inline untuk tab Riwayat penjualan.
 *
 * Bandwidth-aware: query Supabase + subscribe realtime hanya berjalan saat
 * `active=true`. Initial 20 transaksi terakhir hari ini dilewatkan dari
 * server (`initialSales`) sebagai cache supaya tab pertama buka instan.
 */
export function SaleHistoryPanel({
  initialSales,
  active = true,
  currentUserId,
  isAdmin,
  myOutletId,
  onVoided,
  refreshKey = 0,
}: {
  initialSales: SaleHistoryRow[];
  active?: boolean;
  currentUserId: string | null;
  isAdmin: boolean;
  myOutletId: string | null;
  /** Dipanggil saat void berhasil — caller (PosBoard) bisa refetch batches. */
  onVoided?: () => void;
  /**
   * Naikkan setiap kali ada perubahan eksternal (mis. sale baru dibuat dari
   * tab Kasir). Saat berubah & tab aktif, panel akan refetch.
   */
  refreshKey?: number;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const toast = useToast();
  const today = useMemo(() => todayLocalIso(), []);

  const [date, setDate] = useState<string>(() => {
    if (typeof window === "undefined") return today;
    return window.localStorage.getItem(DATE_KEY) ?? today;
  });
  const [rows, setRows] = useState<SaleHistoryRow[]>(initialSales);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingInitial, setUsingInitial] = useState(true);

  // State dialog konfirmasi pembatalan.
  const [voidTarget, setVoidTarget] = useState<SaleHistoryRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  // Persist tanggal pilihan.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DATE_KEY, date);
  }, [date]);

  const fetchByDate = useCallback(
    async (iso: string) => {
      setLoading(true);
      setError(null);
      const { start, end } = dayRangeIso(iso);
      const { data, error } = await supabase
        .from("sales")
        .select(
          `
            id, occurred_at, notes, voided_at, voided_by, void_reason,
            created_by_id:created_by,
            location:locations(id, code, name),
            items:sale_items(quantity, product:products(name, unit)),
            created_by:profiles!sales_created_by_fkey(full_name)
          `,
        )
        .gte("occurred_at", start)
        .lt("occurred_at", end)
        .order("occurred_at", { ascending: false });
      if (error) setError(error.message);
      else setRows(((data ?? []) as unknown as SaleHistoryRow[]) ?? []);
      setLoading(false);
    },
    [supabase],
  );

  // Refetch saat tab aktif atau tanggal berubah. Skip fetch awal kalau
  // tanggalnya hari ini DAN data initial masih dipakai.
  useEffect(() => {
    if (!active) return;
    if (usingInitial && date === today) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchByDate(date);
    setUsingInitial(false);
  }, [active, date, today, usingInitial, fetchByDate]);

  // Refetch saat refreshKey berubah (mis. sale baru dibuat di tab Kasir),
  // sambil tab Riwayat aktif. Skip mount pertama (refreshKey=0).
  useEffect(() => {
    if (!active) return;
    if (refreshKey === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchByDate(date);
    setUsingInitial(false);
    // Sengaja tidak depend `date` di sini — fetch tetap pakai date saat ini,
    // dan effect lain di atas yang handle perubahan date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, active]);

  // Realtime: subscribe perubahan sales hanya saat tab aktif. Saat tab
  // pindah ke Kasir, channel di-unsubscribe agar tidak boros bandwidth.
  useEffect(() => {
    if (!active) return;
    let timer: number | null = null;
    const debouncedRefetch = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void fetchByDate(date), 500);
    };
    const channel = supabase
      .channel("sales-history-panel")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "sales" },
        debouncedRefetch,
      )
      .subscribe();
    return () => {
      if (timer != null) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [active, supabase, fetchByDate, date]);

  const ctx = useMemo(
    () => ({ isAdmin, userId: currentUserId, outletId: myOutletId }),
    [isAdmin, currentUserId, myOutletId],
  );

  // Total qty yang TIDAK termasuk sale yang voided (lebih akurat).
  const totalQty = rows.reduce(
    (sum, r) =>
      r.voided_at
        ? sum
        : sum + r.items.reduce((s, i) => s + Number(i.quantity), 0),
    0,
  );
  const validCount = rows.filter((r) => !r.voided_at).length;

  const closeVoidDialog = useCallback(() => {
    if (voiding) return;
    setVoidTarget(null);
    setVoidReason("");
  }, [voiding]);

  const handleConfirmVoid = useCallback(async () => {
    if (!voidTarget) return;
    setVoiding(true);
    const result = await voidSaleAction(
      voidTarget.id,
      voidReason.trim() || null,
    );
    setVoiding(false);
    if (result.ok) {
      toast.success("Transaksi dibatalkan", "Stok dikembalikan otomatis.");
      setVoidTarget(null);
      setVoidReason("");
      void fetchByDate(date);
      onVoided?.();
    } else {
      toast.error(
        "Gagal membatalkan",
        result.message ?? "Coba lagi atau hubungi admin.",
      );
    }
  }, [voidTarget, voidReason, fetchByDate, date, toast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Hari sebelumnya"
          onClick={() => setDate((d) => shiftDate(d, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm sm:flex-none sm:w-44"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Hari berikutnya"
          onClick={() => setDate((d) => shiftDate(d, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDate(todayLocalIso())}
          disabled={date === today}
        >
          Hari ini
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Muat ulang"
          onClick={() => void fetchByDate(date)}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <div className="ml-auto text-sm text-muted-foreground tabular-nums">
          {validCount} transaksi · {formatNumber(totalQty)} qty
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{formatHumanDate(date)}</p>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border bg-muted/30"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
          Belum ada transaksi pada tanggal ini.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => {
            const total = s.items.reduce(
              (sum, i) => sum + Number(i.quantity),
              0,
            );
            const voided = !!s.voided_at;
            const eligible = canVoid(s, ctx);
            return (
              <li
                key={s.id}
                className={cn(
                  "space-y-2 rounded-xl border bg-card p-4 transition-colors",
                  voided && "border-destructive/30 bg-destructive/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        voided && "line-through opacity-70",
                      )}
                    >
                      {s.location?.name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(s.occurred_at)} ·{" "}
                      {s.created_by?.full_name ?? "Sistem"}
                    </div>
                  </div>
                  {voided ? (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      Dibatalkan
                    </span>
                  ) : (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
                      {formatNumber(total)} item
                    </span>
                  )}
                </div>
                <ul
                  className={cn(
                    "space-y-0.5 text-xs text-muted-foreground",
                    voided && "line-through opacity-70",
                  )}
                >
                  {s.items.map((i, idx) => (
                    <li key={idx} className="flex justify-between gap-2">
                      <span className="truncate">
                        {i.product?.name ?? "?"}
                      </span>
                      <span className="tabular-nums">
                        {formatNumber(Number(i.quantity))} {i.product?.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                {s.notes ? (
                  <p className="rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                    {s.notes}
                  </p>
                ) : null}
                {voided && s.void_reason ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
                    Alasan: {s.void_reason}
                  </p>
                ) : null}
                {eligible ? (
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setVoidTarget(s);
                        setVoidReason("");
                      }}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Ban className="h-4 w-4" />
                      Batalkan
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeVoidDialog();
        }}
        title="Batalkan transaksi?"
        description={
          voidTarget
            ? `Stok pada ${voidTarget.location?.name ?? "outlet"} akan dikembalikan otomatis. Tindakan ini akan tercatat di audit.`
            : ""
        }
      >
        {voidTarget ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {voidTarget.location?.name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(voidTarget.occurred_at)} ·{" "}
                    {voidTarget.created_by?.full_name ?? "Sistem"}
                  </div>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
                  {formatNumber(
                    voidTarget.items.reduce(
                      (s, i) => s + Number(i.quantity),
                      0,
                    ),
                  )}{" "}
                  item
                </span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {voidTarget.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-2">
                    <span className="truncate">{i.product?.name ?? "?"}</span>
                    <span className="tabular-nums">
                      {formatNumber(Number(i.quantity))} {i.product?.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Alasan pembatalan{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (opsional)
                </span>
              </span>
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.currentTarget.value)}
                rows={2}
                maxLength={300}
                placeholder="Mis. salah pilih varian, kasir kelipatan input"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeVoidDialog}
                disabled={voiding}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleConfirmVoid}
                disabled={voiding}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Ban className="h-4 w-4" />
                {voiding ? "Membatalkan…" : "Batalkan transaksi"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
