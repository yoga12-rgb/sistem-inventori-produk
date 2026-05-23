"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableCell } from "@/components/ui/table";
import { ViewportTable } from "@/components/viewport-table";
import { CategoryFormDialog } from "./category-form-dialog";
import { ToggleActiveButton } from "./toggle-active";

export type Category = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort: number;
  is_active: boolean;
};

const columns = [
  { key: "code", label: "Kode" },
  { key: "name", label: "Nama" },
  { key: "icon", label: "Ikon" },
  { key: "color", label: "Warna" },
  { key: "sort", label: "Urutan", className: "text-right" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Aksi", className: "text-right" },
];

export function CategoriesBoard({ categories }: { categories: Category[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.filter((c) => {
      if (status === "active" && !c.is_active) return false;
      if (status === "inactive" && c.is_active) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
      );
    });
  }, [categories, query, status]);

  return (
    <ViewportTable
      rows={filtered}
      columns={columns}
      getRowKey={(c) => c.id}
      empty={
        <div className="py-10 text-center text-sm text-muted-foreground">
          Belum ada kategori. Buat minimal satu untuk mulai mengelompokkan
          produk.
        </div>
      }
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Cari</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Kode atau nama"
              className="min-w-64"
            />
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
            {filtered.length} kategori
          </p>
        </div>
      }
      renderRow={(c) => (
        <>
          <TableCell className="font-mono text-xs">{c.code}</TableCell>
          <TableCell className="font-medium">{c.name}</TableCell>
          <TableCell className="text-lg">{c.icon ?? "-"}</TableCell>
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
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums">{c.sort}</TableCell>
          <TableCell>
            <Badge variant={c.is_active ? "success" : "muted"}>
              {c.is_active ? "Aktif" : "Nonaktif"}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="inline-flex items-center gap-2">
              <CategoryFormDialog category={c} variant="outline" size="sm">
                Ubah
              </CategoryFormDialog>
              <ToggleActiveButton id={c.id} active={c.is_active} />
            </div>
          </TableCell>
        </>
      )}
    />
  );
}
