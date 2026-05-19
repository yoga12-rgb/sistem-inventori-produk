"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { saveOutletAction, type OutletFormState } from "./actions";

type Outlet = {
  id: string;
  code: string;
  name: string;
  type: "central_kitchen" | "outlet";
  is_active: boolean;
};

const initialState: OutletFormState = { ok: false };

/**
 * Dialog wrapper that renders its own trigger button. `children` adalah
 * isi tombol (icon + label) — JSX serializable, aman dilewatkan dari
 * Server Component ke Client Component.
 */
export function OutletFormDialog({
  outlet,
  variant,
  size,
  children,
}: {
  outlet?: Outlet;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    saveOutletAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={outlet ? "Ubah Outlet" : "Tambah Outlet"}
        description={
          outlet
            ? "Perbarui kode, nama, atau status outlet ini."
            : "Buat Central Pastry atau cabang baru."
        }
      >
        <form action={action} className="space-y-4">
          {outlet ? <input type="hidden" name="id" value={outlet.id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Kode"
              htmlFor="code"
              required
              error={state.fieldErrors?.code}
              hint="Contoh: CK01, OUT-JKT"
            >
              <Input
                id="code"
                name="code"
                defaultValue={outlet?.code}
                autoCapitalize="characters"
                autoComplete="off"
                required
                maxLength={20}
              />
            </FormField>

            <FormField
              label="Nama"
              htmlFor="name"
              required
              error={state.fieldErrors?.name}
            >
              <Input
                id="name"
                name="name"
                defaultValue={outlet?.name}
                required
                maxLength={120}
              />
            </FormField>
          </div>

          <FormField label="Tipe" htmlFor="type" required>
            <Select
              id="type"
              name="type"
              defaultValue={outlet?.type ?? "outlet"}
            >
              <option value="outlet">Outlet (cabang)</option>
              <option value="central_kitchen">Central Pastry</option>
            </Select>
          </FormField>

          <Switch
            name="is_active"
            defaultChecked={outlet ? outlet.is_active : true}
            label="Aktif"
          />

          {state.message && !state.ok ? (
            <p className="text-sm text-destructive">{state.message}</p>
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
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
