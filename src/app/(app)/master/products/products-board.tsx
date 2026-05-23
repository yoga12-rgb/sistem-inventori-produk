"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableCell } from "@/components/ui/table";
import { ViewportTable } from "@/components/viewport-table";
import { ProductFormDialog } from "./product-form-dialog";
import { ToggleActiveButton } from "./toggle-active";

export type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category_id: string | null;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  } | null;
  is_perishable: boolean;
  default_shelf_life_hours: number | null;
  expiry_warning_hours: number;
  expiry_discount_percent: number;
  is_active: boolean;
};

const columns = [
  { key: "sku", label: "SKU" },
  { key: "name", label: "Nama" },
  { key: "category", label: "Kategori" },
  { key: "unit", label: "Satuan" },
  { key: "type", label: "Tipe" },
  { key: "shelf", label: "Shelf life", className: "text-right" },
  { key: "warning", label: "Warning", className: "text-right" },
  { key: "discount", label: "Diskon", className: "text-right" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Aksi", className: "text-right" },
];

export function ProductsBoard({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => {
    const map = new Map<string, NonNullable<Product["category"]>>();
    for (const p of products) {
      if (p.category) map.set(p.category.id, p.category);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (type === "perishable" && !p.is_perishable) return false;
      if (type === "non_perishable" && p.is_perishable) return false;
      if (status === "active" && !p.is_active) return false;
      if (status === "inactive" && p.is_active) return false;
      if (category === "uncategorized" && p.category_id !== null) return false;
      if (category !== "all" && category !== "uncategorized" && p.category_id !== category) {
        return false;
      }
      if (!q) return true;
      return (
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
      );
    });
  }, [category, products, query, status, type]);

  return (
    <ViewportTable
      rows={filtered}
      columns={columns}
      getRowKey={(p) => p.id}
      empty={
        <div className="py-10 text-center text-sm text-muted-foreground">
          Belum ada produk. Tambahkan varian pertama untuk memulai.
        </div>
      }
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Cari</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="SKU atau nama"
              className="min-w-64"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Tipe</span>
            <Select
              value={type}
              onChange={(e) => setType(e.currentTarget.value)}
              className="min-w-48"
            >
              <option value="all">Semua tipe</option>
              <option value="perishable">Perishable</option>
              <option value="non_perishable">Non-perishable</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Kategori</span>
            <Select
              value={category}
              onChange={(e) => setCategory(e.currentTarget.value)}
              className="min-w-56"
            >
              <option value="all">Semua kategori</option>
              <option value="uncategorized">Tanpa kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Status</span>
            <Select
              value={status}
              onChange={(e) => setStatus(e.currentTarget.value)}
              className="min-w-44"
            >
              <option value="all">Semua status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </label>
          <p className="ml-auto text-xs text-muted-foreground">
            {filtered.length} produk
          </p>
        </div>
      }
      renderRow={(p) => (
        <>
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
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">{p.unit}</TableCell>
          <TableCell>
            <Badge variant={p.is_perishable ? "warning" : "outline"}>
              {p.is_perishable ? "Perishable" : "Non-perishable"}
            </Badge>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {p.is_perishable && p.default_shelf_life_hours
              ? `${p.default_shelf_life_hours} jam`
              : "-"}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {p.is_perishable ? `${p.expiry_warning_hours} jam` : "-"}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {p.is_perishable
              ? `${Number(p.expiry_discount_percent).toFixed(0)}%`
              : "-"}
          </TableCell>
          <TableCell>
            <Badge variant={p.is_active ? "success" : "muted"}>
              {p.is_active ? "Aktif" : "Nonaktif"}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="inline-flex items-center gap-2">
              <ProductFormDialog product={p} variant="outline" size="sm">
                Ubah
              </ProductFormDialog>
              <ToggleActiveButton id={p.id} active={p.is_active} />
            </div>
          </TableCell>
        </>
      )}
    />
  );
}
