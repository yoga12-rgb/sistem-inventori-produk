import { Grid3x3 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MatrixBoard } from "./matrix-board";
import { requireUser } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

export const metadata = { title: "Inventory Matrix — Sistem Inventaris" };

export default async function MatrixPage() {
  const me = await requireUser();
  const { locations } = await getMasterData();

  if (locations.length === 0) {
    return (
      <EmptyState
        icon={Grid3x3}
        title="Belum ada lokasi"
        description="Hubungi Super Admin untuk menyiapkan outlet & Central Pastry."
      />
    );
  }

  // Default lokasi: outlet kasir bila ada, kalau tidak — semua.
  const defaultLocationId = me.profile?.outlet_id ?? null;

  return (
    <div className="space-y-6">
      <MatrixBoard defaultLocationId={defaultLocationId} />
    </div>
  );
}
