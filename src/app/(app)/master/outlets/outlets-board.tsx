"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableCell } from "@/components/ui/table";
import { ViewportTable } from "@/components/viewport-table";
import { OutletFormDialog } from "./outlet-form-dialog";
import { ToggleActiveButton } from "./toggle-active";

export type Outlet = {
  id: string;
  code: string;
  name: string;
  type: "central_kitchen" | "outlet";
  is_active: boolean;
  created_at: string;
};

const columns = [
  { key: "code", label: "Kode" },
  { key: "name", label: "Nama" },
  { key: "type", label: "Tipe" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Aksi", className: "text-right" },
];

export function OutletsBoard({ outlets }: { outlets: Outlet[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outlets.filter((o) => {
      if (type !== "all" && o.type !== type) return false;
      if (status === "active" && !o.is_active) return false;
      if (status === "inactive" && o.is_active) return false;
      if (!q) return true;
      return (
        o.code.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q)
      );
    });
  }, [outlets, query, status, type]);

  return (
    <ViewportTable
      rows={filtered}
      columns={columns}
      getRowKey={(o) => o.id}
      empty={
        <div className="py-10 text-center text-sm text-muted-foreground">
          Belum ada outlet. Buat Central Pastry dan minimal satu cabang untuk
          memulai.
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
            <span className="text-sm font-medium">Tipe</span>
            <Select
              value={type}
              onChange={(e) => setType(e.currentTarget.value)}
              className="min-w-48"
            >
              <option value="all">Semua tipe</option>
              <option value="central_kitchen">Central Pastry</option>
              <option value="outlet">Outlet</option>
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
            {filtered.length} outlet
          </p>
        </div>
      }
      renderRow={(o) => (
        <>
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
              <OutletFormDialog outlet={o} variant="outline" size="sm">
                Ubah
              </OutletFormDialog>
              <ToggleActiveButton id={o.id} active={o.is_active} />
            </div>
          </TableCell>
        </>
      )}
    />
  );
}
