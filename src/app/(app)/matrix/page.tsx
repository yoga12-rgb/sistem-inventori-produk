import { Grid3x3 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MatrixBoard } from "./matrix-board";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Inventory Matrix — Sistem Inventaris" };

export default async function MatrixPage() {
  const me = await requireUser();

  const supabase = await createSupabaseServerClient();
  const { data: locsData } = await supabase
    .from("locations")
    .select("id, code, name, type")
    .eq("is_active", true)
    .order("type", { ascending: true })
    .order("code", { ascending: true });

  const locations = locsData ?? [];

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
      <MatrixBoard
        locations={locations}
        defaultLocationId={defaultLocationId}
      />
    </div>
  );
}
