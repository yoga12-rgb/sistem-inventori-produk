"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { saveCategoryAction, type CategoryFormState } from "./actions";

type Category = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort: number;
  is_active: boolean;
};

const initialState: CategoryFormState = { ok: false };

export function CategoryFormDialog({
  category,
  variant,
  size,
  children,
}: {
  category?: Category;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    saveCategoryAction,
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
        title={category ? "Ubah Kategori" : "Tambah Kategori"}
        description="Kategori dipakai untuk filter di Penjualan, Stok, dan laporan."
      >
        <form action={action} className="space-y-4">
          {category ? (
            <input type="hidden" name="id" value={category.id} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Kode"
              htmlFor="code"
              required
              error={state.fieldErrors?.code}
              hint="Huruf kecil, misal: pastry"
            >
              <Input
                id="code"
                name="code"
                defaultValue={category?.code}
                autoCapitalize="none"
                autoComplete="off"
                required
                maxLength={40}
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
                defaultValue={category?.name}
                required
                maxLength={80}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              label="Ikon"
              htmlFor="icon"
              error={state.fieldErrors?.icon}
              hint="Emoji, mis. 🥐"
            >
              <Input
                id="icon"
                name="icon"
                defaultValue={category?.icon ?? ""}
                maxLength={8}
                placeholder="🥐"
              />
            </FormField>
            <FormField
              label="Warna"
              htmlFor="color"
              error={state.fieldErrors?.color}
              hint="Hex #RRGGBB"
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  defaultValue={category?.color ?? "#f97316"}
                  onChange={(e) => {
                    const text = document.getElementById(
                      "color",
                    ) as HTMLInputElement | null;
                    if (text) text.value = e.currentTarget.value;
                  }}
                  className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background"
                  aria-label="Pilih warna"
                />
                <Input
                  id="color"
                  name="color"
                  defaultValue={category?.color ?? ""}
                  maxLength={7}
                  placeholder="#f97316"
                />
              </div>
            </FormField>
            <FormField
              label="Urutan"
              htmlFor="sort"
              error={state.fieldErrors?.sort}
              hint="Kecil = muncul lebih dulu"
            >
              <Input
                id="sort"
                name="sort"
                type="number"
                min={0}
                max={9999}
                step="1"
                inputMode="numeric"
                defaultValue={category?.sort ?? 0}
              />
            </FormField>
          </div>

          <Switch
            name="is_active"
            defaultChecked={category ? category.is_active : true}
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
