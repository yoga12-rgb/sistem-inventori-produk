"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const codeSchema = z
  .string()
  .trim()
  .min(2, "Minimal 2 karakter")
  .max(20, "Maksimal 20 karakter")
  .regex(/^[A-Za-z0-9_-]+$/, "Hanya huruf, angka, '-' dan '_'");

const outletSchema = z.object({
  id: z.string().uuid().optional(),
  code: codeSchema,
  name: z.string().trim().min(2, "Minimal 2 karakter"),
  type: z.enum(["central_kitchen", "outlet"]),
  is_active: z.boolean().default(true),
});

export type OutletFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof outletSchema>, string>>;
};

function emptyState(): OutletFormState {
  return { ok: false };
}

export async function saveOutletAction(
  _prev: OutletFormState,
  formData: FormData,
): Promise<OutletFormState> {
  await requireSuperAdmin();

  const raw = {
    id: (formData.get("id") as string) || undefined,
    code: (formData.get("code") as string) ?? "",
    name: (formData.get("name") as string) ?? "",
    type: (formData.get("type") as string) ?? "outlet",
    is_active: formData.get("is_active") === "on",
  };

  const parsed = outletSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: OutletFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof outletSchema>;
      fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const data = parsed.data;

  if (data.id) {
    const { error } = await supabase
      .from("locations")
      .update({
        code: data.code,
        name: data.name,
        type: data.type,
        is_active: data.is_active,
      })
      .eq("id", data.id);

    if (error) {
      return errorToState(error.message);
    }
  } else {
    const { error } = await supabase.from("locations").insert({
      code: data.code,
      name: data.name,
      type: data.type,
      is_active: data.is_active,
    });

    if (error) {
      return errorToState(error.message);
    }
  }

  revalidatePath("/master/outlets");
  revalidatePath("/");
  return { ok: true, message: data.id ? "Outlet diperbarui." : "Outlet dibuat." };
}

export async function toggleOutletActiveAction(
  _prev: OutletFormState,
  formData: FormData,
): Promise<OutletFormState> {
  await requireSuperAdmin();
  const id = formData.get("id") as string | null;
  const next = formData.get("next") === "true";
  if (!id) return { ok: false, message: "ID outlet tidak ditemukan." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("locations")
    .update({ is_active: next })
    .eq("id", id);

  if (error) return errorToState(error.message);
  revalidatePath("/master/outlets");
  return { ok: true };
}

function errorToState(message: string): OutletFormState {
  // Pesan unik dari Postgres untuk constraint code.
  if (message.includes("locations_code_key")) {
    return {
      ok: false,
      message: "Kode outlet sudah dipakai.",
      fieldErrors: { code: "Kode sudah dipakai" },
    };
  }
  return { ok: false, message };
}

export const initialOutletState = emptyState;
