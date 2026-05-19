"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { saveProductAction, type ProductFormState } from "./actions";

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

const initialState: ProductFormState = { ok: false };

export function ProductFormDialog({
  product,
  variant,
  size,
  children,
}: {
  product?: Product;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [perishable, setPerishable] = useState<boolean>(
    product?.is_perishable ?? true,
  );
  const [state, action, pending] = useActionState(
    saveProductAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [state]);

  const handleOpen = () => {
    setPerishable(product?.is_perishable ?? true);
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
        title={product ? "Ubah Produk" : "Tambah Produk"}
        description="Tiap varian = produk independen dengan SKU sendiri."
      >
        <form action={action} className="space-y-4">
          {product ? <input type="hidden" name="id" value={product.id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="SKU"
              htmlFor="sku"
              required
              error={state.fieldErrors?.sku}
              hint="Contoh: SAPI-ORI"
            >
              <Input
                id="sku"
                name="sku"
                defaultValue={product?.sku}
                autoComplete="off"
                required
                maxLength={40}
              />
            </FormField>

            <FormField
              label="Satuan"
              htmlFor="unit"
              required
              error={state.fieldErrors?.unit}
              hint="pcs, box, kg, …"
            >
              <Input
                id="unit"
                name="unit"
                defaultValue={product?.unit ?? "box"}
                required
                maxLength={16}
              />
            </FormField>
          </div>

          <FormField
            label="Nama produk"
            htmlFor="name"
            required
            error={state.fieldErrors?.name}
          >
            <Input
              id="name"
              name="name"
              defaultValue={product?.name}
              required
              maxLength={120}
            />
          </FormField>

          <div className="rounded-lg border bg-background/50 p-4 space-y-4">
            <Switch
              name="is_perishable"
              defaultChecked={perishable}
              onChange={(e) => setPerishable(e.currentTarget.checked)}
              label="Perishable (punya masa ketahanan)"
            />

            <div
              className={`grid gap-4 sm:grid-cols-3 transition-opacity ${
                perishable ? "" : "pointer-events-none opacity-50"
              }`}
            >
              <FormField
                label="Shelf life (jam)"
                htmlFor="default_shelf_life_hours"
                error={state.fieldErrors?.default_shelf_life_hours}
                hint="Default per varian"
              >
                <Input
                  id="default_shelf_life_hours"
                  name="default_shelf_life_hours"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  defaultValue={product?.default_shelf_life_hours ?? ""}
                  disabled={!perishable}
                />
              </FormField>
              <FormField
                label="Warning (jam)"
                htmlFor="expiry_warning_hours"
                error={state.fieldErrors?.expiry_warning_hours}
                hint="Notif sebelum expired"
              >
                <Input
                  id="expiry_warning_hours"
                  name="expiry_warning_hours"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  defaultValue={product?.expiry_warning_hours ?? 24}
                  disabled={!perishable}
                />
              </FormField>
              <FormField
                label="Saran diskon %"
                htmlFor="expiry_discount_percent"
                error={state.fieldErrors?.expiry_discount_percent}
              >
                <Input
                  id="expiry_discount_percent"
                  name="expiry_discount_percent"
                  type="number"
                  step="0.5"
                  min={0}
                  max={100}
                  inputMode="decimal"
                  defaultValue={product?.expiry_discount_percent ?? 0}
                  disabled={!perishable}
                />
              </FormField>
            </div>
          </div>

          <Switch
            name="is_active"
            defaultChecked={product ? product.is_active : true}
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
