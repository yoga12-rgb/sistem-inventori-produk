import { Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StockBoard } from "./stock-board";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Stok — Sistem Inventaris" };

export default async function StokPage() {
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
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Operasional
        </p>
        <h1 className="text-2xl font-semibold">Stok</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ringkasan stok aktif per produk &amp; lokasi. Klik baris untuk
          melihat batch detail. Update real-time saat batch berubah.
        </p>
      </header>
      <StockBoard
        locations={locations}
        defaultLocationId={defaultLocationId}
      />
    </div>
  );
}
