import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Tipe canonical untuk data master yang dipakai di semua halaman.
 * Disimpan di sini agar:
 * - Provider client bisa import type-nya tanpa perlu menarik dependensi server.
 * - Konsumen UI tidak perlu redefine shape sendiri-sendiri.
 */

export type MasterLocation = {
  id: string;
  code: string;
  name: string;
  type: "outlet" | "central_kitchen";
};

export type MasterCategory = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort: number;
};

export type MasterProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category_id: string | null;
  is_perishable: boolean;
  default_shelf_life_hours: number | null;
  expiry_warning_hours: number;
  expiry_discount_percent: number;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  } | null;
};

export type MasterData = {
  locations: MasterLocation[];
  categories: MasterCategory[];
  products: MasterProduct[];
};

/**
 * Ambil data master (locations + categories + products aktif) dalam 1 RTT.
 * Dipanggil sekali di `(app)/layout.tsx` dan disebar ke semua child via
 * `MasterDataProvider`. Mutasi master memanggil `revalidatePath("/", "layout")`
 * supaya layout re-render dan provider menerima data segar.
 *
 * Dibungkus `cache()` dari React supaya kalau page server (mis. /penjualan)
 * butuh memanggil ulang dalam request yang sama, hasilnya dipakai bersama —
 * tidak fetch dobel ke Supabase.
 */
export const getMasterData = cache(async (): Promise<MasterData> => {
  const supabase = await createSupabaseServerClient();

  const [locsRes, catsRes, prodsRes] = await Promise.all([
    supabase
      .from("locations")
      .select("id, code, name, type")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("product_categories")
      .select("id, code, name, icon, color, sort")
      .eq("is_active", true)
      .order("sort", { ascending: true })
      .order("name", { ascending: true }),
    // Note: PostgREST memproses .order() secara berurutan sebagai
    // ORDER BY sort ASC, name ASC (bukan diabaikan).
    supabase
      .from("products")
      .select(
        `
          id, sku, name, unit, category_id,
          is_perishable, default_shelf_life_hours,
          expiry_warning_hours, expiry_discount_percent,
          category:product_categories(id, name, icon, color)
        `,
      )
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const locations = (locsRes.data ?? []) as MasterLocation[];
  const categories = (catsRes.data ?? []) as MasterCategory[];

  // Supabase mengembalikan FK join sebagai array meski FK-nya tunggal —
  // flatten ke object | null agar konsumen tidak perlu cek shape.
  const products = (
    (prodsRes.data ?? []) as unknown as Array<Record<string, unknown>>
  ).map((p) => ({
    ...p,
    category: Array.isArray(p.category)
      ? ((p.category[0] as MasterProduct["category"]) ?? null)
      : ((p.category as MasterProduct["category"]) ?? null),
  })) as unknown as MasterProduct[];

  // Urutkan produk berdasarkan sort kategori, lalu nama produk.
  // Produk tanpa kategori (category_id = null) diletakkan paling akhir.
  const categorySortMap = new Map<string, number>();
  for (const c of categories) categorySortMap.set(c.id, c.sort);

  products.sort((a, b) => {
    const sortA = a.category_id
      ? (categorySortMap.get(a.category_id) ?? 999)
      : 999;
    const sortB = b.category_id
      ? (categorySortMap.get(b.category_id) ?? 999)
      : 999;
    if (sortA !== sortB) return sortA - sortB;
    return a.name.localeCompare(b.name, "id");
  });

  return { locations, categories, products };
});
