import { Plus } from "lucide-react";
import { RegisterPageAction } from "@/components/register-page-action";
import { CategoryFormDialog } from "./category-form-dialog";
import { CategoriesBoard, type Category } from "./categories-board";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Kategori — Sistem Inventaris" };

export default async function CategoriesPage() {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, code, name, icon, color, sort, is_active")
    .order("sort", { ascending: true })
    .order("name", { ascending: true });

  const categories = (data ?? []) as Category[];

  return (
    <div className="space-y-6">
      <RegisterPageAction>
        <CategoryFormDialog>
          <Plus className="h-4 w-4" />
          Tambah Kategori
        </CategoryFormDialog>
      </RegisterPageAction>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : null}

      <CategoriesBoard categories={categories} />
    </div>
  );
}
