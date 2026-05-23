import { Plus } from "lucide-react";
import { RegisterPageAction } from "@/components/register-page-action";
import { UserFormDialog } from "./user-form-dialog";
import { UsersBoard, type UserRow } from "./users-board";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Pengguna — Sistem Inventaris" };

type ProfileRow = {
  id: string;
  full_name: string;
  role: "super_admin" | "cashier";
  outlet_id: string | null;
  is_active: boolean;
  outlet: { id: string; code: string; name: string } | null;
};

export default async function UsersPage() {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: profilesData, error: profilesErr } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, outlet_id, is_active, outlet:locations(id, code, name)",
    )
    .order("full_name", { ascending: true });

  let emailMap = new Map<string, string | null>();
  try {
    const { data: usersList, error: usersErr } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (!usersErr) {
      emailMap = new Map(
        usersList.users.map((u) => [u.id, u.email ?? null] as const),
      );
    }
  } catch {
    // Tidak fatal; halaman tetap berfungsi tanpa kolom email.
  }

  const users = ((profilesData ?? []) as unknown as ProfileRow[]).map(
    (p): UserRow => ({
      ...p,
      email: emailMap.get(p.id) ?? null,
    }),
  );

  return (
    <div className="space-y-6">
      <RegisterPageAction>
        <UserFormDialog>
          <Plus className="h-4 w-4" />
          Tambah Pengguna
        </UserFormDialog>
      </RegisterPageAction>

      {profilesErr ? (
        <p className="text-sm text-destructive">{profilesErr.message}</p>
      ) : null}

      <UsersBoard users={users} />
    </div>
  );
}
