import { Plus } from "lucide-react";
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
import { OutletFormDialog } from "./outlet-form-dialog";
import { ToggleActiveButton } from "./toggle-active";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Outlet — Sistem Inventaris" };

type Outlet = {
  id: string;
  code: string;
  name: string;
  type: "central_kitchen" | "outlet";
  is_active: boolean;
  created_at: string;
};

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

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outlets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Belum ada outlet. Buat Central Pastry dan minimal satu cabang
                  untuk memulai.
                </TableCell>
              </TableRow>
            ) : (
              outlets.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.code}</TableCell>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>
                    <Badge variant={o.type === "central_kitchen" ? "default" : "outline"}>
                      {o.type === "central_kitchen" ? "Central Pastry" : "Outlet"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={o.is_active ? "success" : "muted"}>
                      {o.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <OutletFormDialog
                        outlet={o}
                        variant="outline"
                        size="sm"
                      >
                        Ubah
                      </OutletFormDialog>
                      <ToggleActiveButton id={o.id} active={o.is_active} />
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
