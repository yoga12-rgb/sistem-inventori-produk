import Link from "next/link";
import { Building2, Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ProduksiTabs } from "./produksi-tabs";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Produksi — Sistem Inventaris" };

export default async function ProduksiPage() {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const [{ data: locsData }, { data: productsData }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, code, name, type")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("products")
      .select("id, sku, name, unit, is_perishable, default_shelf_life_hours")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const locations = locsData ?? [];
  const products = productsData ?? [];

  const centralKitchens = locations.filter((l) => l.type === "central_kitchen");

  if (centralKitchens.length === 0 || products.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={centralKitchens.length === 0 ? Building2 : Package}
          title={
            centralKitchens.length === 0
              ? "Belum ada Central Pastry aktif"
              : "Belum ada produk aktif"
          }
          description={
            centralKitchens.length === 0
              ? "Buat lokasi tipe Central Pastry di Master Data sebelum mencatat produksi."
              : "Tambahkan minimal satu varian di Master Produk."
          }
          action={
            <Link
              href={
                centralKitchens.length === 0
                  ? "/master/outlets"
                  : "/master/products"
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Buka Master Data
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProduksiTabs
        products={products}
        centralKitchens={centralKitchens}
        locations={locations}
      />
    </div>
  );
}
