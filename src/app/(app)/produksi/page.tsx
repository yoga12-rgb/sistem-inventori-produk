import Link from "next/link";
import { Building2, Package, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductionForm } from "./production-form";
import { StockEntryForm } from "./stock-entry-form";
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
  const nonPerishableProducts = products.filter((p) => !p.is_perishable);

  if (centralKitchens.length === 0 || products.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Operasional
          </p>
          <h1 className="text-2xl font-semibold">Produksi & Stok Masuk</h1>
        </header>
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
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Operasional
        </p>
        <h1 className="text-2xl font-semibold">Produksi & Stok Masuk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Produksi mencatat batch baru di Central Pastry dan menghitung
          kedaluwarsa otomatis. Stok Masuk dipakai untuk barang non-perishable
          (kemasan, kardus, dsb.).
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>Catat produksi</CardTitle>
            <CardDescription>
              Tambah beberapa varian dalam satu submission. Untuk varian
              perishable, kedaluwarsa terisi otomatis dari shelf life
              produk — silakan override per varian jika perlu.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ProductionForm
            products={products}
            centralKitchens={centralKitchens}
            defaultLocationId={centralKitchens[0].id}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Package className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>Stok masuk (non-perishable)</CardTitle>
            <CardDescription>
              Pemasukan stok ke lokasi mana pun (mis. kemasan langsung ke
              outlet). Untuk produksi pastry, gunakan kartu di atas.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {nonPerishableProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada produk non-perishable aktif.
            </p>
          ) : (
            <StockEntryForm
              products={nonPerishableProducts}
              locations={locations}
              defaultLocationId={centralKitchens[0].id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
