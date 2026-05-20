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
import { CategoryFormDialog } from "./category-form-dialog";
import { ToggleActiveButton } from "./toggle-active";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Kategori — Sistem Inventaris" };

type Category = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort: number;
  is_active: boolean;
};

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

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Ikon</TableHead>
              <TableHead>Warna</TableHead>
              <TableHead className="text-right">Urutan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Belum ada kategori. Buat minimal satu untuk mulai
                  mengelompokkan produk.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-lg">{c.icon ?? "—"}</TableCell>
                  <TableCell>
                    {c.color ? (
                      <div className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="font-mono text-xs text-muted-foreground">
                          {c.color}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.sort}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "success" : "muted"}>
                      {c.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <CategoryFormDialog
                        category={c}
                        variant="outline"
                        size="sm"
                      >
                        Ubah
                      </CategoryFormDialog>
                      <ToggleActiveButton id={c.id} active={c.is_active} />
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
