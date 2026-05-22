"use client";

import Link from "next/link";
import { useTransferInbox } from "@/components/transfer-inbox";
import { cn } from "@/lib/utils";

export type BoxKey = "incoming" | "outgoing" | "history" | "all";

/**
 * Tab navigasi list transfer:
 * - Masuk: pending/in_transit ke outlet user
 * - Keluar: pending/in_transit dari outlet user
 * - Riwayat: yang sudah received/rejected/cancelled
 * - Semua: filter manual (status + outlet)
 *
 * Tab adalah <Link> dengan query param `box=` — page server membaca dan
 * filter query Supabase. Counter di tab Masuk/Keluar dari TransferInbox
 * provider (realtime + polling).
 */
export function TransferBoxTabs({
  current,
  canHaveOutletBoxes,
}: {
  current: BoxKey;
  /** False kalau super admin tanpa outlet — tab Masuk/Keluar disembunyikan. */
  canHaveOutletBoxes: boolean;
}) {
  const inbox = useTransferInbox();

  const tabs: Array<{
    key: BoxKey;
    label: string;
    count?: number;
    show: boolean;
  }> = [
    {
      key: "incoming",
      label: "Masuk",
      count: inbox.incoming,
      show: canHaveOutletBoxes,
    },
    {
      key: "outgoing",
      label: "Keluar",
      count: inbox.outgoing,
      show: canHaveOutletBoxes,
    },
    { key: "history", label: "Riwayat", show: true },
    { key: "all", label: "Semua", show: true },
  ];

  return (
    <div
      role="tablist"
      className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1"
    >
      {tabs
        .filter((t) => t.show)
        .map((t) => {
          const active = t.key === current;
          return (
            <Link
              key={t.key}
              href={`/transfer?box=${t.key}`}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
              {t.count != null && t.count > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {t.count > 99 ? "99+" : t.count}
                </span>
              ) : null}
            </Link>
          );
        })}
    </div>
  );
}
