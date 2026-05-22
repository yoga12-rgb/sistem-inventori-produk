"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useMasterData } from "@/components/master-data-provider";
import { transferStatusLabel, type TransferStatus } from "@/lib/transfer";

const STATUSES: TransferStatus[] = [
  "pending",
  "in_transit",
  "received",
  "cancelled",
  "rejected",
];

const FILTER_KEY = "transfer-list:filters";

type SavedFilters = { status: string; outlet: string };

function readSaved(): SavedFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.status === "string" && typeof parsed?.outlet === "string") {
      return parsed as SavedFilters;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function TransferListFilters({
  defaultOutletId,
}: {
  defaultOutletId: string | null;
}) {
  const { locations } = useMasterData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";
  const outlet = searchParams.get("outlet") ?? "all";

  // Restore filter dari localStorage saat URL belum punya parameter.
  useEffect(() => {
    if (searchParams.has("status") || searchParams.has("outlet")) return;
    const saved = readSaved();
    const next = new URLSearchParams();
    if (saved) {
      if (saved.status !== "all") next.set("status", saved.status);
      if (saved.outlet !== "all") next.set("outlet", saved.outlet);
    } else if (defaultOutletId) {
      next.set("outlet", defaultOutletId);
    }
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (key: "status" | "outlet", value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);

    if (typeof window !== "undefined") {
      const persisted: SavedFilters = {
        status: next.get("status") ?? "all",
        outlet: next.get("outlet") ?? "all",
      };
      window.localStorage.setItem(FILTER_KEY, JSON.stringify(persisted));
    }

    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?");
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Status</span>
        <Select
          value={status}
          onChange={(e) => apply("status", e.currentTarget.value)}
          className="min-w-48"
        >
          <option value="all">Semua status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {transferStatusLabel(s)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Outlet (asal/tujuan)</span>
        <Select
          value={outlet}
          onChange={(e) => apply("outlet", e.currentTarget.value)}
          className="min-w-60"
        >
          <option value="all">Semua outlet</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
