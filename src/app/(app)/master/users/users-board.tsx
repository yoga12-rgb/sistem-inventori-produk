"use client";

import { KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableCell } from "@/components/ui/table";
import { ViewportTable } from "@/components/viewport-table";
import { ResetPasswordDialog, UserFormDialog } from "./user-form-dialog";

export type UserRow = {
  id: string;
  full_name: string;
  role: "super_admin" | "cashier";
  outlet_id: string | null;
  is_active: boolean;
  outlet: { id: string; code: string; name: string } | null;
  email: string | null;
};

const columns = [
  { key: "name", label: "Nama" },
  { key: "email", label: "Email" },
  { key: "role", label: "Peran" },
  { key: "outlet", label: "Outlet" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Aksi", className: "text-right" },
];

export function UsersBoard({ users }: { users: UserRow[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (role !== "all" && u.role !== role) return false;
      if (status === "active" && !u.is_active) return false;
      if (status === "inactive" && u.is_active) return false;
      if (!q) return true;
      return (
        u.full_name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.outlet?.code ?? "").toLowerCase().includes(q) ||
        (u.outlet?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [query, role, status, users]);

  return (
    <ViewportTable
      rows={filtered}
      columns={columns}
      getRowKey={(u) => u.id}
      empty={
        <div className="py-10 text-center text-sm text-muted-foreground">
          Belum ada pengguna selain Anda. Tambah Super Admin lain atau buat
          akun kasir.
        </div>
      }
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Cari</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Nama, email, outlet"
              className="min-w-72"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Peran</span>
            <Select
              value={role}
              onChange={(e) => setRole(e.currentTarget.value)}
              className="min-w-44"
            >
              <option value="all">Semua peran</option>
              <option value="super_admin">Super Admin</option>
              <option value="cashier">Kasir</option>
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
            {filtered.length} pengguna
          </p>
        </div>
      }
      renderRow={(u) => (
        <>
          <TableCell className="font-medium">{u.full_name}</TableCell>
          <TableCell className="text-sm text-muted-foreground">
            {u.email ?? "-"}
          </TableCell>
          <TableCell>
            <Badge variant={u.role === "super_admin" ? "default" : "outline"}>
              {u.role === "super_admin" ? "Super Admin" : "Kasir"}
            </Badge>
          </TableCell>
          <TableCell className="text-sm">
            {u.outlet ? (
              <span>
                <span className="font-mono text-xs text-muted-foreground">
                  {u.outlet.code}
                </span>{" "}
                - {u.outlet.name}
              </span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell>
            <Badge variant={u.is_active ? "success" : "muted"}>
              {u.is_active ? "Aktif" : "Nonaktif"}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="inline-flex items-center gap-2">
              <UserFormDialog
                user={{
                  id: u.id,
                  full_name: u.full_name,
                  role: u.role,
                  outlet_id: u.outlet_id,
                  is_active: u.is_active,
                  email: u.email,
                }}
                variant="outline"
                size="sm"
              >
                Ubah
              </UserFormDialog>
              <ResetPasswordDialog
                user={{
                  id: u.id,
                  full_name: u.full_name,
                  role: u.role,
                  outlet_id: u.outlet_id,
                  is_active: u.is_active,
                  email: u.email,
                }}
              >
                <KeyRound className="h-4 w-4" />
                Reset
              </ResetPasswordDialog>
            </div>
          </TableCell>
        </>
      )}
    />
  );
}
