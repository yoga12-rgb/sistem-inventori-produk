import { KeyRound, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RegisterPageAction } from "@/components/register-page-action";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResetPasswordDialog,
  UserFormDialog,
} from "./user-form-dialog";
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

  // Profiles + outlet (RLS allow super admin select all).
  const { data: profilesData, error: profilesErr } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, outlet_id, is_active, outlet:locations(id, code, name)",
    )
    .order("full_name", { ascending: true });

  // Outlet aktif untuk dropdown.
  const { data: outletsData } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("is_active", true)
    .order("code", { ascending: true });

  // Email dari Auth (service role karena email tidak ada di profiles).
  // Jika service role belum diset, kita tetap render dengan email = null.
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
    // Tidak fatal — halaman tetap berfungsi tanpa kolom email.
  }

  const profiles = ((profilesData ?? []) as unknown as ProfileRow[]).map((p) => ({
    ...p,
    email: emailMap.get(p.id) ?? null,
  }));
  const outlets = outletsData ?? [];

  return (
    <div className="space-y-6">
      <RegisterPageAction>
        <UserFormDialog outlets={outlets}>
          <Plus className="h-4 w-4" />
          Tambah Pengguna
        </UserFormDialog>
      </RegisterPageAction>

      {profilesErr ? (
        <p className="text-sm text-destructive">{profilesErr.message}</p>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Belum ada pengguna selain Anda. Tambah Super Admin lain atau
                  buat akun kasir.
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.role === "super_admin" ? "default" : "outline"}>
                      {p.role === "super_admin" ? "Super Admin" : "Kasir"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.outlet ? (
                      <span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.outlet.code}
                        </span>{" "}
                        — {p.outlet.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "success" : "muted"}>
                      {p.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <UserFormDialog
                        user={{
                          id: p.id,
                          full_name: p.full_name,
                          role: p.role,
                          outlet_id: p.outlet_id,
                          is_active: p.is_active,
                          email: p.email,
                        }}
                        outlets={outlets}
                        variant="outline"
                        size="sm"
                      >
                        Ubah
                      </UserFormDialog>
                      <ResetPasswordDialog
                        user={{
                          id: p.id,
                          full_name: p.full_name,
                          role: p.role,
                          outlet_id: p.outlet_id,
                          is_active: p.is_active,
                          email: p.email,
                        }}
                      >
                        <KeyRound className="h-4 w-4" />
                        Reset
                      </ResetPasswordDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
