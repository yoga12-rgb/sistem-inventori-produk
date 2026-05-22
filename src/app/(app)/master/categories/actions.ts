"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HEX = /^#[0-9a-fA-F]{6}$/;

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2, "Min. 2 karakter")
    .max(40, "Maks. 40 karakter")
    .regex(/^[a-z0-9_-]+$/i, "Hanya huruf, angka, _ dan -"),
  name: z.string().trim().min(1, "Wajib diisi").max(80, "Maks. 80 karakter"),
  icon: z
    .string()
    .trim()
    .max(8, "Maks. 8 karakter")
    .nullable(),
  color: z
    .string()
    .trim()
    .regex(HEX, "Format hex #RRGGBB")
    .nullable(),
  sort: z
    .number({ message: "Harus angka" })
    .int("Harus bilangan bulat")
    .min(0, "Min. 0")
    .max(9999, "Maks. 9999"),
  is_active: z.boolean(),
});

export type CategoryFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof categorySchema>, string>>;
};

function num(v: FormDataEntryValue | null): number {
  if (v == null) return 0;
  const t = String(v).trim();
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

export async function saveCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireSuperAdmin();

  const id = ((formData.get("id") as string) ?? "").trim() || undefined;
  const raw = {
    id,
    code: ((formData.get("code") as string) ?? "").trim().toLowerCase(),
    name: (formData.get("name") as string) ?? "",
    icon: ((formData.get("icon") as string) ?? "").trim() || null,
    color: ((formData.get("color") as string) ?? "").trim() || null,
    sort: num(formData.get("sort")),
    is_active: formData.get("is_active") === "on",
  };

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: CategoryFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof categorySchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;

  const supabase = await createSupabaseServerClient();
  const payload = {
    code: data.code,
    name: data.name,
    icon: data.icon,
    color: data.color,
    sort: data.sort,
    is_active: data.is_active,
  };

  const { error } = data.id
    ? await supabase.from("product_categories").update(payload).eq("id", data.id)
    : await supabase.from("product_categories").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: "Kode kategori sudah dipakai.",
        fieldErrors: { code: "Sudah ada kategori dengan kode ini" },
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/master/categories");
  revalidatePath("/master/products");
  revalidatePath("/penjualan");
  revalidatePath("/stok");
  revalidatePath("/", "layout");
  return { ok: true, message: data.id ? "Kategori diperbarui." : "Kategori dibuat." };
}

export async function toggleCategoryActiveAction(
  id: string,
  next: boolean,
): Promise<{ ok: boolean; message?: string }> {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_categories")
    .update({ is_active: next })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/master/categories");
  revalidatePath("/master/products");
  revalidatePath("/penjualan");
  revalidatePath("/stok");
  revalidatePath("/", "layout");
  return { ok: true };
}
