"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const disposalSchema = z.object({
  product_id: z.string().uuid(),
  location_id: z.string().uuid(),
  movement_type: z.enum([
    "expired_out",
    "compliment_out",
    "tester_out",
    "damage_out",
  ]),
  quantity: z
    .number({ message: "Harus angka" })
    .int("Harus bilangan bulat")
    .positive("Minimal 1"),
  batch_id: z.string().uuid().nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export type DisposalState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof disposalSchema>, string>>;
};

function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function recordDisposalAction(
  _prev: DisposalState,
  formData: FormData,
): Promise<DisposalState> {
  const me = await requireUser();

  const raw = {
    product_id: (formData.get("product_id") as string) ?? "",
    location_id: (formData.get("location_id") as string) ?? "",
    movement_type:
      ((formData.get("movement_type") as string) ?? "expired_out") as
        | "expired_out"
        | "compliment_out"
        | "tester_out"
        | "damage_out",
    quantity: num(formData.get("quantity")) ?? Number.NaN,
    batch_id: ((formData.get("batch_id") as string) ?? "").trim() || null,
    notes: ((formData.get("notes") as string) ?? "").trim() || null,
  };

  const parsed = disposalSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: DisposalState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof disposalSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;

  if (
    me.profile?.role !== "super_admin" &&
    me.profile?.outlet_id !== data.location_id
  ) {
    return {
      ok: false,
      message: "Anda hanya bisa mencatat disposal di outlet sendiri.",
      fieldErrors: { location_id: "Outlet tidak diizinkan" },
    };
  }

  const supabase = await createSupabaseServerClient();
  if (data.batch_id) {
    const { data: batch, error: batchError } = await supabase
      .from("stock_batches")
      .select("id")
      .eq("id", data.batch_id)
      .eq("product_id", data.product_id)
      .eq("location_id", data.location_id)
      .maybeSingle();

    if (batchError) return { ok: false, message: batchError.message };
    if (!batch) {
      return {
        ok: false,
        message: "Batch tidak cocok dengan produk atau lokasi yang dipilih.",
        fieldErrors: { batch_id: "Batch tidak valid" },
      };
    }
  }
  const { error } = await supabase.rpc("fn_record_disposal", {
    p_product_id: data.product_id,
    p_location_id: data.location_id,
    p_quantity: data.quantity,
    p_movement_type: data.movement_type,
    p_batch_id: data.batch_id ?? undefined,
    p_notes: data.notes ?? undefined,
    p_occurred_at: new Date().toISOString(),
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/stok");
  revalidatePath("/eod");
  revalidatePath("/matrix");
  revalidatePath("/aktivitas");
  return { ok: true, message: "Stok dibuang." };
}
