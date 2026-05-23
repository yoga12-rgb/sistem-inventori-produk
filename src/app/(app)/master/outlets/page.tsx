import { Plus } from "lucide-react";
import { RegisterPageAction } from "@/components/register-page-action";
import { OutletFormDialog } from "./outlet-form-dialog";
import { OutletsBoard, type Outlet } from "./outlets-board";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Outlet — Sistem Inventaris" };

export default async function OutletsPage() {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, code, name, type, is_active, created_at")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  const outlets = (data ?? []) as Outlet[];

  return (
    <div className="space-y-6">
      <RegisterPageAction>
        <OutletFormDialog>
          <Plus className="h-4 w-4" />
          Tambah Outlet
        </OutletFormDialog>
      </RegisterPageAction>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : null}

      <OutletsBoard outlets={outlets} />
    </div>
  );
}
