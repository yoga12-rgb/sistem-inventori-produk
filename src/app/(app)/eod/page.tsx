import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { EodPanel } from "./eod-panel";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "End of Day — Sistem Inventaris" };

export default async function EodPage() {
  const me = await requireUser();
  const isAdmin = me.profile?.role === "super_admin";

  const supabase = await createSupabaseServerClient();
  const { data: locsData } = await supabase
    .from("locations")
    .select("id, code, name, type")
    .eq("is_active", true)
    .order("code", { ascending: true });

  const outlets = (locsData ?? []).filter((l) => l.type === "outlet");
  const myOutletId = me.profile?.outlet_id ?? null;

  const allowedOutlets = isAdmin
    ? outlets
    : outlets.filter((l) => l.id === myOutletId);

  if (allowedOutlets.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Operasional
          </p>
          <h1 className="text-2xl font-semibold">End of Day</h1>
        </header>
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

      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Operasional
        </p>
        <h1 className="text-2xl font-semibold">End of Day Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ringkasan penjualan dan stok akhir hari ini. Bagikan ke WhatsApp
          dengan satu sentuhan.
        </p>
      </header>

      <EodPanel
        outlets={allowedOutlets}
        defaultOutletId={defaultOutletId}
      />
    </div>
  );
}
