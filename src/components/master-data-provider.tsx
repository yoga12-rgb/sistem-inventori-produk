"use client";

import { createContext, useContext, useMemo } from "react";
import type {
  MasterCategory,
  MasterData,
  MasterLocation,
  MasterProduct,
} from "@/lib/master-data";

/**
 * Provider in-memory untuk data master (locations, categories, products).
 *
 * Karakter:
 * - Initial value DARI SERVER (`(app)/layout.tsx`) → tidak ada flash kosong,
 *   tidak ada hydration mismatch.
 * - Lifetime: tab session. Setiap navigasi App Router tidak refetch karena
 *   layout segment tidak re-render.
 * - Sumber kebenaran tetap server: mutasi master memanggil
 *   `revalidatePath("/", "layout")` → layout RSC re-fetch → provider
 *   menerima props baru → semua consumer re-render.
 *
 * Tidak menyentuh localStorage. Lihat docs untuk alasan (stale data, multi-tab
 * inconsistency, schema drift, dll).
 */

type MasterDataContextValue = MasterData & {
  /**
   * Lookup map untuk akses O(1) by id. Dibangun sekali per props.
   */
  productById: Map<string, MasterProduct>;
  categoryById: Map<string, MasterCategory>;
  locationById: Map<string, MasterLocation>;
};

const MasterDataContext = createContext<MasterDataContextValue | null>(null);

export function MasterDataProvider({
  data,
  children,
}: {
  data: MasterData;
  children: React.ReactNode;
}) {
  const value = useMemo<MasterDataContextValue>(() => {
    const productById = new Map<string, MasterProduct>();
    for (const p of data.products) productById.set(p.id, p);
    const categoryById = new Map<string, MasterCategory>();
    for (const c of data.categories) categoryById.set(c.id, c);
    const locationById = new Map<string, MasterLocation>();
    for (const l of data.locations) locationById.set(l.id, l);
    return {
      locations: data.locations,
      categories: data.categories,
      products: data.products,
      productById,
      categoryById,
      locationById,
    };
  }, [data]);

  return (
    <MasterDataContext.Provider value={value}>
      {children}
    </MasterDataContext.Provider>
  );
}

/**
 * Hook utama. Throw kalau dipanggil di luar provider — supaya bug ketahuan
 * sejak development, bukan diam-diam render array kosong.
 */
export function useMasterData(): MasterDataContextValue {
  const ctx = useContext(MasterDataContext);
  if (!ctx) {
    throw new Error(
      "useMasterData() harus dipanggil di dalam <MasterDataProvider>. " +
        "Pastikan komponen ini berada di bawah (app)/layout.tsx.",
    );
  }
  return ctx;
}

/**
 * Helper khusus untuk halaman yang hanya butuh outlets (subset locations
 * dengan type='outlet'). Dipakai di POS, EOD, dll.
 */
export function useOutlets(): MasterLocation[] {
  const { locations } = useMasterData();
  return useMemo(
    () => locations.filter((l) => l.type === "outlet"),
    [locations],
  );
}
