"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ---------- Schema ---------------------------------------------------------

const initialStockItemSchema = z.object({
  location_id: z.string().uuid("Pilih lokasi"),
  product_id: z.string().uuid("Pilih produk"),
  quantity: z
    .number({ message: "Harus angka" })
    .int("Harus bilangan bulat")
    .positive("Minimal 1"),
  produced_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  notes: z.string().trim().max(500).nullable(),
});

const initialStockFormSchema = z.object({
  items: z.array(initialStockItemSchema).min(1, "Minimal satu item"),
});

// ---------- State type -----------------------------------------------------

export type InitialStockState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Jumlah item yang berhasil dicatat */
  successCount?: number;
  /** Error per item (index) */
  itemErrors?: { index: number; message: string }[];
};

// ---------- Server action --------------------------------------------------

export async function recordInitialStockAction(
  _prev: InitialStockState,
  formData: FormData,
): Promise<InitialStockState> {
  await requireSuperAdmin();

  let items: unknown = [];
  try {
    items = JSON.parse((formData.get("items") as string) || "[]");
  } catch {
    return {
      ok: false,
      message: "Data item tidak valid.",
      fieldErrors: { items: "Format tidak valid" },
    };
  }

  const parsed = initialStockFormSchema.safeParse({ items });
  if (!parsed.success) {
    const fieldErrors: InitialStockState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }

  const data = parsed.data;
  const supabase = await createSupabaseServerClient();
  const errors: { index: number; message: string }[] = [];
  let successCount = 0;

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];

    const { error } = await supabase.rpc("fn_initial_stock_entry", {
      p_location_id: item.location_id,
      p_product_id: item.product_id,
      p_quantity: item.quantity,
      p_produced_at: item.produced_at
        ? new Date(item.produced_at).toISOString()
        : null,
      p_expires_at: item.expires_at
        ? new Date(item.expires_at).toISOString()
        : null,
      p_notes: item.notes,
    });

    if (error) {
      errors.push({ index: i, message: error.message });
    } else {
      successCount++;
    }
  }

  revalidatePath("/stok");
  revalidatePath("/initial-stock");

  if (errors.length > 0) {
    return {
      ok: false,
      message: `${successCount} item berhasil dicatat, ${errors.length} gagal.`,
      successCount,
      itemErrors: errors,
    };
  }

  return {
    ok: true,
    message: `${successCount} item stok awal berhasil dicatat.`,
    successCount,
  };
}
