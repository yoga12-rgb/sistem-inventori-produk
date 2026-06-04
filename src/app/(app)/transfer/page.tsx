import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { z } from "zod";
import { type BoxKey } from "./box-tabs";
import { TransferBoard, type TransferListRow } from "./transfer-board";
import { RegisterPageAction } from "@/components/register-page-action";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type TransferStatus } from "@/lib/transfer";

export const metadata = { title: "Transfer - Sistem Inventaris" };

type SearchParams = Promise<{
  status?: string;
  outlet?: string;
  box?: string;
}>;

const ACTIVE_STATUSES: TransferStatus[] = ["pending", "in_transit"];
const BOXES = new Set<BoxKey>(["incoming", "outgoing", "history", "all"]);

// Whitelist nilai untuk searchParams. Nilai selain UUID/status valid diabaikan
// agar string URL tidak bisa dipotong masuk ke filter PostgREST `.or(...)`.
const VALID_STATUSES = new Set<TransferStatus>([
  "pending",
  "in_transit",
  "received",
  "cancelled",
  "rejected",
]);

const uuidSchema = z.string().uuid();

function safeUuid(value: string | undefined): string | null {
  if (!value || value === "all") return null;
  const r = uuidSchema.safeParse(value);
  return r.success ? r.data : null;
}

function safeStatus(value: string | undefined): TransferStatus | null {
  if (!value || value === "all") return null;
  return VALID_STATUSES.has(value as TransferStatus)
    ? (value as TransferStatus)
    : null;
}

function safeBox(value: string | undefined): BoxKey | null {
  return BOXES.has(value as BoxKey) ? (value as BoxKey) : null;
}

function transferListUrl(box: BoxKey, sp: Awaited<SearchParams>): string {
  const params = new URLSearchParams();
  params.set("box", box);

  if (box === "all") {
    const status = safeStatus(sp.status);
    const outlet = safeUuid(sp.outlet);
    if (status) params.set("status", status);
    if (outlet) params.set("outlet", outlet);
  }

  return `/transfer?${params.toString()}`;
}

export default async function TransferListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const myOutlet = me.profile?.outlet_id ?? null;
  const isAdmin = me.profile?.role === "super_admin";
  const canHaveOutletBoxes = !!myOutlet;

  // Default tab: kasir dengan outlet -> "incoming"; admin/no outlet -> "all".
  // Incoming/outgoing dinormalisasi saat user tidak punya outlet.
  const requestedBox = safeBox(sp.box);
  const defaultBox: BoxKey = !isAdmin && canHaveOutletBoxes ? "incoming" : "all";
  const box: BoxKey =
    requestedBox &&
    (canHaveOutletBoxes || requestedBox === "history" || requestedBox === "all")
      ? requestedBox
      : defaultBox;

  if (sp.box && requestedBox !== box) {
    redirect(transferListUrl(box, sp));
  }

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("transfers")
    .select(
      `
        id, code, mode, status, notes,
        created_at, shipped_at, received_at,
        from_location:locations!transfers_from_location_id_fkey(id, code, name),
        to_location:locations!transfers_to_location_id_fkey(id, code, name),
        items:transfer_items(quantity)
      `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // Filter berdasarkan tab.
  if (box === "incoming" && myOutlet) {
    query = query.eq("to_location_id", myOutlet).in("status", ACTIVE_STATUSES);
  } else if (box === "outgoing" && myOutlet) {
    query = query
      .eq("from_location_id", myOutlet)
      .in("status", ACTIVE_STATUSES);
  } else if (box === "history") {
    query = query.in("status", ["received", "rejected", "cancelled"]);
    if (myOutlet && !isAdmin) {
      query = query.or(
        `from_location_id.eq.${myOutlet},to_location_id.eq.${myOutlet}`,
      );
    }
  } else if (box === "all") {
    if (myOutlet && !isAdmin) {
      query = query.or(
        `from_location_id.eq.${myOutlet},to_location_id.eq.${myOutlet}`,
      );
    }
  }

  // Filter sekunder via TransferListFilters (status & outlet) hanya berlaku
  // pada tab "all" agar tidak konflik dengan filter tab utama.
  if (box === "all") {
    const safeStatusFilter = safeStatus(sp.status);
    if (safeStatusFilter) {
      query = query.eq("status", safeStatusFilter);
    }
    const safeOutletFilter = safeUuid(sp.outlet);
    if (safeOutletFilter) {
      query = query.or(
        `from_location_id.eq.${safeOutletFilter},to_location_id.eq.${safeOutletFilter}`,
      );
    }
  }

  const { data, error } = await query;
  const rows = ((data ?? []) as unknown as TransferListRow[]) ?? [];

  return (
    <div className="space-y-6">
      <RegisterPageAction>
        <Link
          href="/transfer/baru"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Buat Transfer
        </Link>
      </RegisterPageAction>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : null}

      <TransferBoard
        rows={rows}
        box={box}
        canHaveOutletBoxes={canHaveOutletBoxes}
        defaultOutletId={myOutlet}
      />
    </div>
  );
}
