"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useMasterData } from "@/components/master-data-provider";
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserAction,
  type UserFormState,
} from "./actions";

type UserRow = {
  id: string;
  full_name: string;
  role: "super_admin" | "cashier";
  outlet_id: string | null;
  is_active: boolean;
  email: string | null;
};

const initialState: UserFormState = { ok: false };

export function UserFormDialog({
  user,
  variant,
  size,
  children,
}: {
  user?: UserRow;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children: React.ReactNode;
}) {
  // Outlet daftar dari master data provider — yang aktif saja.
  const { locations } = useMasterData();
  const outlets = locations.filter((l) => l.type === "outlet");
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<UserRow["role"]>(user?.role ?? "cashier");
  const [state, action, pending] = useActionState(
    user ? updateUserAction : createUserAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  const handleOpen = () => {
    setRole(user?.role ?? "cashier");
    setOpen(true);
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={handleOpen}>
        {children}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={user ? "Ubah Pengguna" : "Tambah Pengguna"}
        description={
          user
            ? "Perbarui peran, outlet, atau status. Email tidak dapat diubah."
            : "Akun login Supabase + profil dibuat sekaligus."
        }
      >
        <form action={action} className="space-y-4">
          {user ? <input type="hidden" name="id" value={user.id} /> : null}

          {!user ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Email"
                htmlFor="email"
                required
                error={state.fieldErrors?.email as string | undefined}
              >
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                />
              </FormField>
              <FormField
                label="Password sementara"
                htmlFor="password"
                required
                error={state.fieldErrors?.password as string | undefined}
                hint="Min. 8 karakter"
              >
                <Input
                  id="password"
                  name="password"
                  type="text"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </FormField>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Email:{" "}
              <span className="font-medium text-foreground">
                {user.email ?? "—"}
              </span>
            </div>
          )}

          <FormField
            label="Nama lengkap"
            htmlFor="full_name"
            required
            error={state.fieldErrors?.full_name as string | undefined}
          >
            <Input
              id="full_name"
              name="full_name"
              defaultValue={user?.full_name}
              required
              maxLength={120}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Peran" htmlFor="role" required>
              <Select
                id="role"
                name="role"
                defaultValue={user?.role ?? "cashier"}
                onChange={(e) =>
                  setRole(e.currentTarget.value as UserRow["role"])
                }
              >
                <option value="cashier">Kasir</option>
                <option value="super_admin">Super Admin</option>
              </Select>
            </FormField>

            <FormField
              label="Outlet"
              htmlFor="outlet_id"
              error={state.fieldErrors?.outlet_id as string | undefined}
              hint={
                role === "cashier" ? "Wajib untuk kasir" : "Opsional untuk admin"
              }
              required={role === "cashier"}
            >
              <Select
                id="outlet_id"
                name="outlet_id"
                defaultValue={user?.outlet_id ?? ""}
                required={role === "cashier"}
              >
                <option value="">— Tidak ditugaskan —</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <Switch
            name="is_active"
            defaultChecked={user ? user.is_active : true}
            label="Aktif"
          />

          {state.message ? (
            <p
              className={`text-sm ${
                state.ok
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive"
              }`}
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Menyimpan…"
                : user
                  ? "Simpan perubahan"
                  : "Buat akun"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ResetPasswordDialog({
  user,
  variant,
  size,
  children,
}: {
  user: UserRow;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    resetUserPasswordAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => {
        setOpen(false);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <Button
        variant={variant ?? "ghost"}
        size={size ?? "sm"}
        title="Reset password"
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Reset Password"
        description={`Setel password baru untuk ${user.full_name}.`}
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={user.id} />
          <FormField
            label="Password baru"
            htmlFor="password"
            required
            error={state.fieldErrors?.password as string | undefined}
            hint="Min. 8 karakter"
          >
            <Input
              id="password"
              name="password"
              type="text"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </FormField>

          {state.message ? (
            <p
              className={`text-sm ${
                state.ok
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive"
              }`}
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Mereset…" : "Reset"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
