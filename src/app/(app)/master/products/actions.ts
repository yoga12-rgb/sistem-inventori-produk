"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const skuSchema = z
  .string()
  .trim()
  .min(2, "Minimal 2 karakter")
  .max(40, "Maksimal 40 karakter")
  .regex(/^[A-Za-z0-9_-]+$/, "Hanya huruf, angka, '-' dan '_'");

const productSchema = z
  .object({
    id: z.string().uuid().optional(),
    sku: skuSchema,
    name: z.string().trim().min(2, "Minimal 2 karakter"),
    unit: z.string().trim().min(1, "Satuan wajib diisi").max(16),
    category_id: z.string().uuid().nullable(),
    is_perishable: z.boolean(),
    default_shelf_life_hours: z
      .number({ message: "Harus angka" })
      .int("Harus bilangan bulat")
      .positive("Harus lebih dari 0")
      .nullable(),
    expiry_warning_hours: z
      .number({ message: "Harus angka" })
      .int("Harus bilangan bulat")
      .min(0, "Tidak boleh negatif"),
    expiry_discount_percent: z
      .number({ message: "Harus angka" })
      .min(0, "0 - 100")
      .max(100, "0 - 100"),
    is_active: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.is_perishable && val.default_shelf_life_hours == null) {
      ctx.addIssue({
        code: "custom",
        path: ["default_shelf_life_hours"],
        message: "Wajib untuk produk perishable",
      });
    }
  });

export type ProductFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof productSchema>, string>
  >;
};

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
}

export async function saveProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireSuperAdmin();

  const isPerishable = formData.get("is_perishable") === "on";

  const raw = {
    id: (formData.get("id") as string) || undefined,
    sku: (formData.get("sku") as string) ?? "",
    name: (formData.get("name") as string) ?? "",
    unit: ((formData.get("unit") as string) ?? "pcs").trim() || "pcs",
    category_id:
      ((formData.get("category_id") as string) ?? "").trim() || null,
    is_perishable: isPerishable,
    default_shelf_life_hours: isPerishable
      ? toNumberOrNull(formData.get("default_shelf_life_hours"))
      : null,
    expiry_warning_hours: toNumberOrNull(formData.get("expiry_warning_hours")) ?? 24,
    expiry_discount_percent:
      toNumberOrNull(formData.get("expiry_discount_percent")) ?? 0,
    is_active: formData.get("is_active") === "on",
  };

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: ProductFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof productSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const data = parsed.data;

  const payload = {
    sku: data.sku,
    name: data.name,
    unit: data.unit,
    category_id: data.category_id,
    is_perishable: data.is_perishable,
    default_shelf_life_hours: data.default_shelf_life_hours,
    expiry_warning_hours: data.expiry_warning_hours,
    expiry_discount_percent: data.expiry_discount_percent,
    is_active: data.is_active,
  };

  if (data.id) {
    const { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", data.id);
    if (error) return errorToState(error.message);
  } else {
    const { error } = await supabase.from("products").insert(payload);
    if (error) return errorToState(error.message);
  }

  revalidatePath("/master/products");
  revalidatePath("/penjualan");
  revalidatePath("/stok");
  revalidatePath("/");
  return { ok: true, message: data.id ? "Produk diperbarui." : "Produk dibuat." };
}

export async function toggleProductActiveAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireSuperAdmin();
  const id = formData.get("id") as string | null;
  const next = formData.get("next") === "true";
  if (!id) return { ok: false, message: "ID produk tidak ditemukan." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: next })
    .eq("id", id);
  if (error) return errorToState(error.message);
  revalidatePath("/master/products");
  return { ok: true };
}

function errorToState(message: string): ProductFormState {
  if (message.includes("products_sku_key")) {
    return {
      ok: false,
      message: "SKU sudah dipakai.",
      fieldErrors: { sku: "SKU sudah dipakai" },
    };
  }
  return { ok: false, message };
}
