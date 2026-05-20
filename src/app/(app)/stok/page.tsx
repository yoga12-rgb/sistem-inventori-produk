import { Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StockBoard } from "./stock-board";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Stok — Sistem Inventaris" };

export default async function StokPage() {
  const me = await requireUser();

  const supabase = await createSupabaseServerClient();

  const [{ data: locsData }, { data: catData }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, code, name, type")
      .eq("is_active", true)
      .order("type", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("product_categories")
      .select("id, name, icon, color")
      .eq("is_active", true)
      .order("sort", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const locations = locsData ?? [];
  const categories = catData ?? [];

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
  const defaultLocationId =
    me.profile?.outlet_id ?? locations[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <StockBoard
        locations={locations}
        categories={categories}
        defaultLocationId={defaultLocationId}
      />
    </div>
  );
}
