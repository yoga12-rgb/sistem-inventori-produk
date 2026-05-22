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
import { ProductFormDialog } from "./product-form-dialog";
import { ToggleActiveButton } from "./toggle-active";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Produk — Sistem Inventaris" };

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category_id: string | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  is_perishable: boolean;
  default_shelf_life_hours: number | null;
  expiry_warning_hours: number;
  expiry_discount_percent: number;
  is_active: boolean;
};

export default async function ProductsPage() {
  await requireSuperAdmin();

  // Master products di provider hanya yang is_active=true. Halaman master
  // ini perlu daftar lengkap (termasuk inactive) supaya admin bisa aktifkan
  // ulang — jadi tetap fetch sendiri di sini.
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
      ? (p.category as unknown[])[0] as Product["category"] ?? null
      : p.category ?? null,
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

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Satuan</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="text-right">Shelf life</TableHead>
              <TableHead className="text-right">Warning</TableHead>
              <TableHead className="text-right">Diskon</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Belum ada produk. Tambahkan varian pertama untuk memulai.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    {p.category ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={
                          p.category.color
                            ? {
                                borderColor: `${p.category.color}66`,
                                backgroundColor: `${p.category.color}1f`,
                                color: p.category.color,
                              }
                            : undefined
                        }
                      >
                        {p.category.icon ? <span>{p.category.icon}</span> : null}
                        {p.category.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.unit}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_perishable ? "warning" : "outline"}>
                      {p.is_perishable ? "Perishable" : "Non-perishable"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.is_perishable && p.default_shelf_life_hours
                      ? `${p.default_shelf_life_hours} jam`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.is_perishable ? `${p.expiry_warning_hours} jam` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.is_perishable
                      ? `${Number(p.expiry_discount_percent).toFixed(0)}%`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "success" : "muted"}>
                      {p.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <ProductFormDialog
                        product={p}
                        variant="outline"
                        size="sm"
                      >
                        Ubah
                      </ProductFormDialog>
                      <ToggleActiveButton id={p.id} active={p.is_active} />
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
