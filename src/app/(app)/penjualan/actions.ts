"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SaleFormState } from "./state";

const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z
    .number({ message: "Qty harus angka" })
    .int("Qty harus bilangan bulat")
    .positive("Qty minimal 1"),
  override_batch_id: z.string().uuid().nullable(),
});

const saleSchema = z.object({
  location_id: z.string().uuid("Pilih outlet"),
  occurred_at: z.string().min(1, "Wajib diisi"),
  notes: z.string().trim().max(500).nullable(),
  items: z.array(saleItemSchema).min(1, "Minimal satu item"),
});

export async function createSaleAction(
  _prev: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  await requireUser();

  let items: unknown = [];
  try {
    items = JSON.parse((formData.get("items") as string) || "[]");
  } catch {
    return {
      ok: false,
      message: "Item penjualan tidak valid.",
      fieldErrors: { items: "Format tidak valid" },
    };
  }

  const raw = {
    location_id: (formData.get("location_id") as string) ?? "",
    occurred_at: (formData.get("occurred_at") as string) ?? "",
    notes: ((formData.get("notes") as string) ?? "").trim() || null,
    items,
  };

  const parsed = saleSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: SaleFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof saleSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fn_record_sale", {
    p_location_id: data.location_id,
    p_occurred_at: new Date(data.occurred_at).toISOString(),
    p_notes: data.notes,
    p_items: data.items,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/penjualan");
  revalidatePath("/stok");
  revalidatePath("/eod");
  return { ok: true, message: "Transaksi tercatat." };
}


export type VoidSaleResult = {
  ok: boolean;
  message?: string;
};

/**
 * Membatalkan satu transaksi penjualan (soft delete + reversal stok).
 * Permission ditegakkan oleh RLS pada UPDATE sales:
 *   - Super admin bebas.
 *   - Kasir hanya transaksi sendiri di outletnya pada hari yang sama.
 */
export async function voidSaleAction(
  saleId: string,
  reason: string | null,
): Promise<VoidSaleResult> {
  await requireUser();

  if (!saleId || typeof saleId !== "string") {
    return { ok: false, message: "ID transaksi tidak valid." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fn_void_sale", {
    p_sale_id: saleId,
    p_reason: reason && reason.trim().length > 0 ? reason.trim() : null,
  });

  if (error) {
    // RLS row-level violation tampil sebagai error 42501 / new row violates
    // policy. Mapping pesan biar UX user-friendly.
    if (
      error.message.toLowerCase().includes("row-level security") ||
      error.message.toLowerCase().includes("policy")
    ) {
      return {
        ok: false,
        message:
          "Tidak diizinkan membatalkan transaksi ini (mungkin bukan milik Anda atau bukan hari yang sama).",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/penjualan");
  revalidatePath("/stok");
  revalidatePath("/eod");
  revalidatePath("/matrix");
  return { ok: true };
}
