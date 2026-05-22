"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CreateTransferState, RpcState } from "./state";

// NOTE: file ini hanya boleh meng-export async function (ketentuan
// Next.js 16 untuk file "use server"). Semua tipe ada di ./state.

const itemSchema = z.object({
  source_batch_id: z.string().uuid(),
  quantity: z
    .number({ message: "Qty harus angka" })
    .int("Qty harus bilangan bulat")
    .positive("Qty minimal 1"),
});

const createSchema = z.object({
  from_location_id: z.string().uuid("Pilih asal"),
  to_location_id: z.string().uuid("Pilih tujuan"),
  mode: z.enum(["one_way", "two_way"]),
  notes: z.string().trim().max(500).nullable(),
  items: z.array(itemSchema).min(1, "Minimal satu item"),
});

export async function createTransferAction(
  _prev: CreateTransferState,
  formData: FormData,
): Promise<CreateTransferState> {
  await requireUser();

  // Items dikirim dalam satu hidden field JSON.
  let items: unknown = [];
  try {
    items = JSON.parse((formData.get("items") as string) || "[]");
  } catch {
    return {
      ok: false,
      message: "Item transfer tidak valid.",
      fieldErrors: { items: "Format tidak valid" },
    };
  }

  const raw = {
    from_location_id: (formData.get("from_location_id") as string) ?? "",
    to_location_id: (formData.get("to_location_id") as string) ?? "",
    mode: ((formData.get("mode") as string) ?? "two_way") as
      | "one_way"
      | "two_way",
    notes: ((formData.get("notes") as string) ?? "").trim() || null,
    items,
  };

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: CreateTransferState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof createSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Periksa kembali isian.", fieldErrors };
  }
  const data = parsed.data;
  if (data.from_location_id === data.to_location_id) {
    return {
      ok: false,
      message: "Lokasi asal & tujuan harus berbeda.",
      fieldErrors: { to_location_id: "Tidak boleh sama dengan asal" },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: newId, error } = await supabase.rpc("fn_create_transfer", {
    p_from_location_id: data.from_location_id,
    p_to_location_id: data.to_location_id,
    p_mode: data.mode,
    p_notes: data.notes,
    p_items: data.items,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/transfer");
  revalidatePath("/stok");
  redirect(`/transfer/${newId as string}`);
}

async function callRpc(
  fn:
    | "fn_ship_transfer"
    | "fn_confirm_transfer"
    | "fn_cancel_transfer"
    | "fn_reject_transfer"
    | "fn_update_transfer_items",
  params: Record<string, unknown>,
  transferId: string,
): Promise<RpcState> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, params);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/transfer");
  revalidatePath(`/transfer/${transferId}`);
  revalidatePath("/stok");
  return { ok: true };
}

export async function shipTransferAction(
  _prev: RpcState,
  formData: FormData,
): Promise<RpcState> {
  const id = (formData.get("id") as string) ?? "";
  return callRpc("fn_ship_transfer", { p_transfer_id: id }, id);
}

/**
 * Konfirmasi terima transfer.
 *
 * Mendukung dua mode:
 *   1. Penerimaan utuh: tanpa field `items`. Semua qty original diterima.
 *   2. Penerimaan parsial: field `items` berisi JSON
 *      [{ item_id, received_qty, loss_reason? }, ...]. Selisih
 *      (quantity - received_qty) dicatat sebagai movement `transfer_loss`
 *      di lokasi asal (akuntabilitas pengirim).
 */
export async function confirmTransferAction(
  _prev: RpcState,
  formData: FormData,
): Promise<RpcState> {
  const id = (formData.get("id") as string) ?? "";
  const itemsRaw = (formData.get("items") as string) || "";

  let parsedItems: Array<{
    item_id: string;
    received_qty: number;
    loss_reason: string | null;
  }> | null = null;

  if (itemsRaw.trim().length > 0) {
    try {
      const json = JSON.parse(itemsRaw);
      const schema = z
        .array(
          z.object({
            item_id: z.string().uuid(),
            received_qty: z
              .number()
              .int("Qty diterima harus bilangan bulat")
              .min(0, "Qty diterima minimal 0"),
            loss_reason: z.string().trim().max(300).nullable().optional(),
          }),
        )
        .min(1);
      const result = schema.safeParse(json);
      if (!result.success) {
        return {
          ok: false,
          message:
            result.error.issues[0]?.message ?? "Item penerimaan tidak valid",
        };
      }
      parsedItems = result.data.map((it) => ({
        item_id: it.item_id,
        received_qty: it.received_qty,
        loss_reason: it.loss_reason ?? null,
      }));
    } catch {
      return { ok: false, message: "Format item tidak valid" };
    }
  }

  return callRpc(
    "fn_confirm_transfer",
    { p_transfer_id: id, p_items: parsedItems },
    id,
  );
}

export async function cancelTransferAction(
  _prev: RpcState,
  formData: FormData,
): Promise<RpcState> {
  const id = (formData.get("id") as string) ?? "";
  return callRpc("fn_cancel_transfer", { p_transfer_id: id }, id);
}

export async function rejectTransferAction(
  _prev: RpcState,
  formData: FormData,
): Promise<RpcState> {
  const id = (formData.get("id") as string) ?? "";
  const reason = ((formData.get("reason") as string) ?? "").trim() || null;
  return callRpc(
    "fn_reject_transfer",
    { p_transfer_id: id, p_reason: reason },
    id,
  );
}

/**
 * Edit item transfer selama status `pending`. Pengirim atau super admin saja.
 *
 * `items` field di FormData = JSON array of
 *   { source_batch_id: uuid, quantity: int }.
 *
 * Implementasi server: rebuild items (kembalikan stok lama, deduct ulang).
 */
export async function updateTransferItemsAction(
  _prev: RpcState,
  formData: FormData,
): Promise<RpcState> {
  const id = (formData.get("id") as string) ?? "";
  const itemsRaw = (formData.get("items") as string) || "";
  let items: unknown = [];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { ok: false, message: "Format item tidak valid" };
  }
  const schema = z
    .array(
      z.object({
        source_batch_id: z.string().uuid(),
        quantity: z
          .number()
          .int("Qty harus bilangan bulat")
          .positive("Qty minimal 1"),
      }),
    )
    .min(1, "Minimal satu item");
  const parsed = schema.safeParse(items);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Item tidak valid",
    };
  }

  return callRpc(
    "fn_update_transfer_items",
    { p_transfer_id: id, p_items: parsed.data },
    id,
  );
}
