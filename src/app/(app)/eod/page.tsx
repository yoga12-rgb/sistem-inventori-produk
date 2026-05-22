import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { EodPanel } from "./eod-panel";
import { requireUser } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

export const metadata = { title: "End of Day — Sistem Inventaris" };

export default async function EodPage() {
  const me = await requireUser();
  const isAdmin = me.profile?.role === "super_admin";

  // Master di-cache di layout. Page di sini hanya menentukan ID outlet yang
  // ALLOWED untuk user (cashier hanya outletnya, admin semua) — EodPanel
  // membaca daftar outlet langsung dari provider.
  const { locations } = await getMasterData();
  const outlets = locations.filter((l) => l.type === "outlet");
  const myOutletId = me.profile?.outlet_id ?? null;

  const allowedOutlets = isAdmin
    ? outlets
    : outlets.filter((l) => l.id === myOutletId);

  if (allowedOutlets.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={Receipt}
          title="Belum ada outlet"
          description="Buat outlet (cabang) terlebih dahulu di Master Data."
        />
      </div>
    );
  }

  const defaultOutletId =
    allowedOutlets.find((l) => l.id === myOutletId)?.id ??
    allowedOutlets[0].id;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/penjualan"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Penjualan
        </Link>
      </div>

      <EodPanel
        allowedOutletIds={allowedOutlets.map((o) => o.id)}
        defaultOutletId={defaultOutletId}
      />
    </div>
  );
}
