"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type SaleHistoryRow = {
  id: string;
  occurred_at: string;
  notes: string | null;
  location: { code: string; name: string } | null;
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

/**
 * Sheet kanan menampilkan riwayat transaksi pada tanggal terpilih.
 * Pre-fetch (20 terakhir) dipakai sebagai cache awal untuk hari ini supaya
 * buka pertama kali tetap instan; perubahan tanggal memicu refetch.
 */
export function SaleHistorySheet({
  open,
  onOpenChange,
  initialSales,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSales: SaleHistoryRow[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const today = useMemo(() => todayLocalIso(), []);

  const [date, setDate] = useState<string>(today);
  const [rows, setRows] = useState<SaleHistoryRow[]>(initialSales);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingInitial, setUsingInitial] = useState(true);

  const fetchByDate = useCallback(
    async (iso: string) => {
      setLoading(true);
      setError(null);
      const { start, end } = dayRangeIso(iso);
      const { data, error } = await supabase
        .from("sales")
        .select(
          `
            id, occurred_at, notes,
            location:locations(code, name),
            items:sale_items(quantity, product:products(name, unit)),
            created_by:profiles(full_name)
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

  // Refetch ketika sheet dibuka atau tanggal berubah.
  // Skip fetch awal kalau tanggalnya hari ini DAN data initial masih dipakai.
  useEffect(() => {
    if (!open) return;
    if (usingInitial && date === today) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    void fetchByDate(date);
    setUsingInitial(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, date, today, usingInitial, fetchByDate]);

  const totalQty = rows.reduce(
    (sum, r) => sum + r.items.reduce((s, i) => s + Number(i.quantity), 0),
    0,
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Riwayat penjualan"
      description={`${rows.length} transaksi · ${formatNumber(totalQty)} qty total`}
    >
      <div className="space-y-3 p-4">
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
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
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
        </div>
        <p className="text-xs text-muted-foreground">{formatHumanDate(date)}</p>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border bg-muted/30"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Belum ada transaksi pada tanggal ini.
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((s) => {
            const total = s.items.reduce(
              (sum, i) => sum + Number(i.quantity),
              0,
            );
            return (
              <li key={s.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {s.location?.name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(s.occurred_at)} ·{" "}
                      {s.created_by?.full_name ?? "Sistem"}
                    </div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
                    {formatNumber(total)} item
                  </span>
                </div>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
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
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
