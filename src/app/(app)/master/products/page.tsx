import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  is_perishable: boolean;
  default_shelf_life_hours: number | null;
  expiry_warning_hours: number;
  expiry_discount_percent: number;
  is_active: boolean;
};

export default async function ProductsPage() {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, name, unit, is_perishable, default_shelf_life_hours, expiry_warning_hours, expiry_discount_percent, is_active",
    )
    .order("name", { ascending: true });

  const products = (data ?? []) as Product[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Master Data
          </p>
          <h1 className="text-2xl font-semibold">Produk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Setiap varian punya SKU sendiri. Atur shelf life & saran diskon
            untuk produk perishable.
          </p>
        </div>
        <ProductFormDialog>
          <Plus className="h-4 w-4" />
          Tambah Produk
        </ProductFormDialog>
      </header>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nama</TableHead>
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
                  colSpan={9}
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
