"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ProductionFormState,
  StockEntryFormState,
  EditProductionState,
  VoidProductionState,
} from "./state";

// ---------- Production batch (multi-item) ------------------------------

const productionItemSchema = z.object({
  product_id: z.string().uuid("Pilih produk"),
  quantity: z
    .number({ message: "Harus angka" })
    .int("Harus bilangan bulat")
    .positive("Minimal 1"),
  /** ISO datetime string atau null. Untuk non-perishable, dianggap null. */
  expires_at: z
    .string()
    .nullable()
    .refine((value) => value === null || isValidDateInput(value), {
      message: "Tanggal kedaluwarsa tidak valid",
    }),
});

const productionBatchSchema = z.object({
  location_id: z.string().uuid("Pilih lokasi"),
  produced_at: z
    .string()
    .min(1, "Wajib diisi")
    .refine(isValidDateInput, "Tanggal produksi tidak valid"),
  items: z.array(productionItemSchema).min(1, "Minimal satu item"),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  for (const [index, item] of data.items.entries()) {
    if (seen.has(item.product_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["items", index, "product_id"],
        message: "Produk yang sama tidak boleh dipakai di dua baris.",
      });
      return;
    }
    seen.add(item.product_id);
  }
});

function isValidDateInput(value: string): boolean {
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

export async function recordProductionBatchAction(
  _prev: ProductionFormState,
  formData: FormData,
): Promise<ProductionFormState> {
  await requireSuperAdmin();

  let items: unknown = [];
  try {
    items = JSON.parse((formData.get("items") as string) || "[]");
  } catch {
    return {
      ok: false,
      message: "Item produksi tidak valid.",
      fieldErrors: { items: "Format tidak valid" },
    };
  }

  const raw = {
    location_id: (formData.get("location_id") as string) ?? "",
    produced_at: (formData.get("produced_at") as string) ?? "",
    items,
  };

  const parsed = productionBatchSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: ProductionFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof productionBatchSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;

  // Konversi item.expires_at ke ISO + sanitize untuk RPC.
  const itemsForRpc = data.items.map((it) => ({
    product_id: it.product_id,
    quantity: it.quantity,
    expires_at: it.expires_at ? toIso(it.expires_at) : null,
  }));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fn_record_production_batch", {
    p_location_id: data.location_id,
    p_produced_at: toIso(data.produced_at),
    p_items: itemsForRpc,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/produksi");
  revalidatePath("/stok");
  return {
    ok: true,
    message: `${data.items.length} batch produksi tercatat.`,
  };
}

// ---------- Stock entry (non-perishable, single-item tetap) ------------

const stockEntrySchema = z.object({
  product_id: z.string().uuid("Pilih produk"),
  location_id: z.string().uuid("Pilih lokasi"),
  quantity: z
    .number({ message: "Harus angka" })
    .int("Harus bilangan bulat")
    .positive("Minimal 1"),
  entered_at: z
    .string()
    .min(1, "Wajib diisi")
    .refine(isValidDateInput, "Tanggal masuk tidak valid"),
  notes: z.string().trim().max(500).nullable(),
});

function num(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export async function recordStockEntryAction(
  _prev: StockEntryFormState,
  formData: FormData,
): Promise<StockEntryFormState> {
  await requireSuperAdmin();

  const raw = {
    product_id: (formData.get("product_id") as string) ?? "",
    location_id: (formData.get("location_id") as string) ?? "",
    quantity: num(formData.get("quantity")) ?? Number.NaN,
    entered_at: (formData.get("entered_at") as string) ?? "",
    notes: ((formData.get("notes") as string) ?? "").trim() || null,
  };

  const parsed = stockEntrySchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: StockEntryFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof stockEntrySchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fn_record_stock_entry", {
    p_product_id: data.product_id,
    p_location_id: data.location_id,
    p_quantity: data.quantity,
    p_entered_at: toIso(data.entered_at),
    p_notes: data.notes,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/produksi");
  revalidatePath("/stok");
  return { ok: true, message: "Stok masuk tercatat." };
}

// ---------- Edit production qty ----------------------------------------

const editProductionSchema = z.object({
  batch_id: z.string().uuid(),
  new_qty: z
    .number({ message: "Harus angka" })
    .int("Harus bilangan bulat")
    .positive("Minimal 1"),
  reason: z.string().max(500).nullable(),
});

export async function editProductionQtyAction(
  _prev: EditProductionState,
  formData: FormData,
): Promise<EditProductionState> {
  await requireSuperAdmin();

  const raw = {
    batch_id: (formData.get("batch_id") as string) ?? "",
    new_qty: num(formData.get("new_qty")) ?? Number.NaN,
    reason: ((formData.get("reason") as string) ?? "").trim() || null,
  };

  const parsed = editProductionSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Periksa kembali isian.";
    return { ok: false, message: msg };
  }
  const data = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fn_update_production_qty", {
    p_batch_id: data.batch_id,
    p_new_qty: data.new_qty,
    p_reason: data.reason,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/produksi");
  revalidatePath("/stok");
  return { ok: true, message: "Qty produksi berhasil diubah." };
}

// ---------- Void / hapus production ------------------------------------

export async function voidProductionAction(
  _prev: VoidProductionState,
  formData: FormData,
): Promise<VoidProductionState> {
  await requireSuperAdmin();

  const batch_id = (formData.get("batch_id") as string) ?? "";
  const reason = ((formData.get("reason") as string) ?? "").trim() || null;

  if (!batch_id) return { ok: false, message: "Batch ID tidak valid." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fn_void_production", {
    p_batch_id: batch_id,
    p_reason: reason,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/produksi");
  revalidatePath("/stok");
  return { ok: true, message: "Produksi berhasil dihapus." };
}
