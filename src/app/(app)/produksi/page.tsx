import Link from "next/link";
import { Building2, Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ProduksiTabs } from "./produksi-tabs";
import { requireSuperAdmin } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

export const metadata = { title: "Produksi — Sistem Inventaris" };

export default async function ProduksiPage() {
  await requireSuperAdmin();

  // Master di-cache di layout. Di sini hanya untuk gating empty state —
  // ProduksiTabs sendiri membaca master via provider.
  const { locations, products } = await getMasterData();
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

  return <ProduksiTabs />;
}
