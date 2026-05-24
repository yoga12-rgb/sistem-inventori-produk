import { Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StockBoard } from "./stock-board";
import { requireUser } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

export const metadata = { title: "Stok - Sistem Inventaris" };

export default async function StokPage() {
  await requireUser();

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

  return (
    <div className="space-y-6">
      <StockBoard />
    </div>
  );
}
