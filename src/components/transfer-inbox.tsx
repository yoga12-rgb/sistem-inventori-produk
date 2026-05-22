"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Context untuk badge "transfer pending" di sidebar/topbar.
 *
 * - `incoming`: transfer berstatus pending/in_transit ke outlet user (atau
 *   semua kalau super admin).
 * - `outgoing`: transfer berstatus pending/in_transit dari outlet user
 *   (atau semua kalau super admin) — biasanya yang harus DI-SHIP.
 *
 * Sumber data: 1 query Supabase di mount, lalu refresh debounced setiap
 * channel `transfers` mengirim event. Polling fallback 60s untuk
 * environment tanpa realtime.
 */

type InboxCounts = {
  incoming: number;
  outgoing: number;
};

const InboxContext = createContext<InboxCounts>({ incoming: 0, outgoing: 0 });

export function TransferInboxProvider({
  children,
  myOutletId,
  isAdmin,
}: {
  children: React.ReactNode;
  myOutletId: string | null;
  isAdmin: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [counts, setCounts] = useState<InboxCounts>({
    incoming: 0,
    outgoing: 0,
  });

  useEffect(() => {
    if (!isAdmin && !myOutletId) return;
    let mounted = true;
    let debounceTimer: number | null = null;

    async function refresh() {
      const incomingQ = supabase
        .from("transfers")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_transit"]);
      const outgoingQ = supabase
        .from("transfers")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_transit"]);

      // Filter by outlet kalau bukan admin.
      if (!isAdmin && myOutletId) {
        incomingQ.eq("to_location_id", myOutletId);
        outgoingQ.eq("from_location_id", myOutletId);
      } else {
        // Admin → tidak filter; incoming/outgoing tidak relevan, set sama.
        // Kita tampilkan total saja sebagai "incoming".
      }

      const [inc, out] = await Promise.all([incomingQ, outgoingQ]);
      if (!mounted) return;
      setCounts({
        incoming: inc.count ?? 0,
        outgoing: isAdmin ? 0 : out.count ?? 0,
      });
    }

    void refresh();

    const debouncedRefresh = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void refresh(), 500);
    };

    // Realtime channel — di production akan trigger; di lokal idle.
    const channel = supabase
      .channel("transfer-inbox-counts")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "transfers" },
        debouncedRefresh,
      )
      .subscribe();

    // Polling fallback (60s).
    const poll = window.setInterval(() => void refresh(), 60_000);

    return () => {
      mounted = false;
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [supabase, myOutletId, isAdmin]);

  return (
    <InboxContext.Provider value={counts}>{children}</InboxContext.Provider>
  );
}

export function useTransferInbox(): InboxCounts {
  return useContext(InboxContext);
}
