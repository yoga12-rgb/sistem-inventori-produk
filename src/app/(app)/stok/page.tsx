import { Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StockBoard } from "./stock-board";
import { requireUser } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

export const metadata = { title: "Stok — Sistem Inventaris" };

export default async function StokPage() {
  const me = await requireUser();

  // Master data di-cache di layout — di sini kita hanya ambil locations
  // untuk gating empty state & default selection.
  const { locations } = await getMasterData();

  if (locations.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Belum ada lokasi"
        description="Hubungi Super Admin untuk menyiapkan outlet & Central Pastry."
      />
    );
  }

  // Default: outlet kasir kalau ada, kalau tidak — semua.
  const defaultLocationId = me.profile?.outlet_id ?? locations[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <StockBoard defaultLocationId={defaultLocationId} />
    </div>
  );
}
