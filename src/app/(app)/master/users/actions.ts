"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const baseUserSchema = z.object({
  full_name: z.string().trim().min(2, "Minimal 2 karakter"),
  role: z.enum(["super_admin", "cashier"]),
  outlet_id: z.string().uuid().nullable(),
  is_active: z.boolean(),
});

const createUserSchema = baseUserSchema.extend({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

const updateUserSchema = baseUserSchema.extend({
  id: z.string().uuid(),
});

export type UserFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<
      | keyof z.input<typeof createUserSchema>
      | keyof z.input<typeof updateUserSchema>,
      string
    >
  >;
};

function validateRoleOutlet(
  role: "super_admin" | "cashier",
  outlet_id: string | null,
): string | null {
  if (role === "cashier" && !outlet_id) {
    return "Kasir wajib ditugaskan ke satu outlet.";
  }
  return null;
}

/**
 * Super Admin creates a new user via the service-role admin client, then
 * inserts the corresponding row into `public.profiles`.
 *
 * If the profile insert fails, we delete the auth user to avoid orphans.
 */
export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireSuperAdmin();

  const raw = {
    email: ((formData.get("email") as string) ?? "").trim(),
    password: (formData.get("password") as string) ?? "",
    full_name: ((formData.get("full_name") as string) ?? "").trim(),
    role: (formData.get("role") as string) ?? "cashier",
    outlet_id: (formData.get("outlet_id") as string) || null,
    is_active: formData.get("is_active") === "on",
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: UserFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof createUserSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;

  const roleErr = validateRoleOutlet(data.role, data.outlet_id);
  if (roleErr) {
    return {
      ok: false,
      message: roleErr,
      fieldErrors: { outlet_id: "Pilih outlet" },
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.full_name },
  });
  if (createErr || !created.user) {
    return { ok: false, message: createErr?.message ?? "Gagal membuat akun." };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: data.full_name,
    role: data.role,
    outlet_id: data.outlet_id,
    is_active: data.is_active,
  });

  if (profileErr) {
    // Bersihkan auth user agar tidak ada orphan.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: profileErr.message };
  }

  revalidatePath("/master/users");
  return { ok: true, message: "Akun dibuat." };
}

export async function updateUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireSuperAdmin();

  const raw = {
    id: (formData.get("id") as string) ?? "",
    full_name: ((formData.get("full_name") as string) ?? "").trim(),
    role: (formData.get("role") as string) ?? "cashier",
    outlet_id: (formData.get("outlet_id") as string) || null,
    is_active: formData.get("is_active") === "on",
  };

  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: UserFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof updateUserSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;

  const roleErr = validateRoleOutlet(data.role, data.outlet_id);
  if (roleErr) {
    return {
      ok: false,
      message: roleErr,
      fieldErrors: { outlet_id: "Pilih outlet" },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: data.full_name,
      role: data.role,
      outlet_id: data.outlet_id,
      is_active: data.is_active,
    })
    .eq("id", data.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/master/users");
  return { ok: true, message: "Profil diperbarui." };
}

export async function resetUserPasswordAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireSuperAdmin();
  const id = (formData.get("id") as string) ?? "";
  const password = (formData.get("password") as string) ?? "";

  if (!id) return { ok: false, message: "ID tidak ditemukan." };
  if (password.length < 8)
    return {
      ok: false,
      message: "Password minimal 8 karakter.",
      fieldErrors: { password: "Min. 8 karakter" },
    };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Password di-reset." };
}
