import Link from "next/link";
import { Building2, Package } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { InitialStockForm } from "./initial-stock-form";
import { requireSuperAdmin } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

export const metadata = { title: "Stok Awal — Sistem Inventaris" };

export default async function InitialStockPage() {
  await requireSuperAdmin();

  const { locations, products } = await getMasterData();

  if (locations.length === 0 || products.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={locations.length === 0 ? Building2 : Package}
          title={
            locations.length === 0
              ? "Belum ada lokasi aktif"
              : "Belum ada produk aktif"
          }
          description={
            locations.length === 0
              ? "Buat lokasi di Master Data sebelum mengisi stok awal."
              : "Tambahkan minimal satu produk di Master Produk."
          }
          action={
            <Link
              href={
                locations.length === 0
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
      <div className="rounded-xl border bg-card p-5">
        <InitialStockForm
          products={products}
          locations={locations}
          defaultLocationId={locations[0]?.id ?? ""}
        />
      </div>
    </div>
  );
}
