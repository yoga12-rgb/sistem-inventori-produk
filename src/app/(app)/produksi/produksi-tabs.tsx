"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Package, Sparkles } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useMasterData } from "@/components/master-data-provider";
import { ProductionForm } from "./production-form";
import { ProductionHistory } from "./production-history";
import { StockEntryForm } from "./stock-entry-form";

const TAB_KEY = "produksi-tab";
type TabKey = "produksi" | "stok-masuk" | "riwayat";

export function ProduksiTabs() {
  const master = useMasterData();
  const products = master.products;
  const locations = master.locations;
  const centralKitchens = useMemo(
    () => locations.filter((l) => l.type === "central_kitchen"),
    [locations],
  );

  const [tab, setTab] = useState<TabKey>("produksi");

  // Restore tab dari localStorage (sekali saat mount).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TAB_KEY);
    if (
      saved === "produksi" ||
      saved === "stok-masuk" ||
      saved === "riwayat"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(saved);
    }
  }, []);

  // Persist saat berubah.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const nonPerishableProducts = useMemo(
    () => products.filter((p) => !p.is_perishable),
    [products],
  );

  // Page server component sudah gating ini, tapi kita tetap defensif.
  if (centralKitchens.length === 0) return null;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as TabKey)}
      className="flex h-[calc(100dvh-10.5rem)] min-h-[32rem] flex-col gap-2 lg:h-[calc(100dvh-8rem)]"
    >
      <div className="sticky top-0 z-30 flex-shrink-0 bg-background pb-1">
        <TabsList className="h-10">
          <TabsTrigger value="produksi">
            <Sparkles className="h-4 w-4" />
            Catat produksi
          </TabsTrigger>
          <TabsTrigger value="stok-masuk">
            <Package className="h-4 w-4" />
            Stok masuk
          </TabsTrigger>
          <TabsTrigger value="riwayat">
            <History className="h-4 w-4" />
            Riwayat produksi
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="produksi" className="mt-0 min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col rounded-xl border bg-card p-3">
          <div className="mb-2 flex-shrink-0">
            <h2 className="text-base font-semibold">Catat produksi</h2>
          </div>
          <ProductionForm
            products={products}
            centralKitchens={centralKitchens}
            defaultLocationId={centralKitchens[0].id}
          />
        </div>
      </TabsContent>

      <TabsContent value="stok-masuk" className="mt-0 min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col rounded-xl border bg-card p-3">
          <div className="mb-2 flex-shrink-0">
            <h2 className="text-base font-semibold">
              Stok masuk (non-perishable)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pemasukan stok ke lokasi mana pun (mis. kemasan langsung ke
              outlet). Untuk produksi pastry, gunakan tab Catat produksi.
            </p>
          </div>
          {nonPerishableProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada produk non-perishable aktif.
            </p>
          ) : (
            <div className="min-h-0 flex-1">
              <StockEntryForm
                products={nonPerishableProducts}
                locations={locations}
                defaultLocationId={centralKitchens[0].id}
              />
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="riwayat" className="mt-0 min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col rounded-xl border bg-card p-3">
          <div className="mb-2 flex-shrink-0">
            <h2 className="text-base font-semibold">Riwayat produksi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Daftar batch yang diproduksi pada tanggal terpilih. Filter
              tanggal & lokasi tersimpan di browser.
            </p>
          </div>
          {/*
            `active` flag memastikan ProductionHistory hanya fetch &
            subscribe realtime saat tab ini sedang dibuka - hemat
            bandwidth Supabase.
          */}
          <ProductionHistory
            centralKitchens={centralKitchens.map((l) => ({
              id: l.id,
              code: l.code,
              name: l.name,
            }))}
            defaultLocationId={centralKitchens[0]?.id ?? null}
            active={tab === "riwayat"}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
