import { Plus } from "lucide-react";
import { RegisterPageAction } from "@/components/register-page-action";
import { ProductFormDialog } from "./product-form-dialog";
import { ProductsBoard, type Product } from "./products-board";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Produk — Sistem Inventaris" };

export default async function ProductsPage() {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { data: prodData, error } = await supabase
    .from("products")
    .select(
      `
        id, sku, name, unit, category_id,
        is_perishable, default_shelf_life_hours,
        expiry_warning_hours, expiry_discount_percent, is_active,
        category:product_categories(id, name, icon, color)
      `,
    )
    .order("name", { ascending: true });

  const products = ((prodData ?? []) as unknown as Product[]).map((p) => ({
    ...p,
    category: Array.isArray(p.category)
      ? (((p.category as unknown[])[0] as Product["category"]) ?? null)
      : (p.category ?? null),
  }));

  return (
    <div className="space-y-6">
      <RegisterPageAction>
        <ProductFormDialog>
          <Plus className="h-4 w-4" />
          Tambah Produk
        </ProductFormDialog>
      </RegisterPageAction>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : null}

      <ProductsBoard products={products} />
    </div>
  );
}
