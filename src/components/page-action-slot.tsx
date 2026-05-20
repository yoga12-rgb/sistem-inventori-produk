"use client";

import * as React from "react";

/**
 * Context untuk render tombol aksi primer halaman (mis. "Tambah Outlet",
 * "Buat Transfer") di top bar global, bukan di header halaman.
 *
 * Pemakaian:
 *   - AppShell membungkus tree dengan <PageActionSlotProvider/>
 *   - AppShell merender slot output via <PageActionSlotOutlet/>
 *   - Page component memanggil hook usePageAction(node) untuk mendaftar.
 *     Saat unmount, registrasi otomatis dibersihkan.
 */

type Ctx = {
  setNode: (node: React.ReactNode | null) => void;
  node: React.ReactNode | null;
};

const PageActionContext = React.createContext<Ctx | null>(null);

export function PageActionSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<React.ReactNode | null>(null);
  const value = React.useMemo<Ctx>(() => ({ node, setNode }), [node]);
  return (
    <PageActionContext.Provider value={value}>
      {children}
    </PageActionContext.Provider>
  );
}

/** Render slot di tempat yang diinginkan (mis. top bar). */
export function PageActionSlotOutlet() {
  const ctx = React.useContext(PageActionContext);
  if (!ctx?.node) return null;
  return <>{ctx.node}</>;
}

/**
 * Mendaftarkan tombol aksi yang akan dirender di top bar global.
 * Hanya dipakai dari Client Component.
 */
export function usePageAction(node: React.ReactNode) {
  const ctx = React.useContext(PageActionContext);
  React.useEffect(() => {
    if (!ctx) return;
    ctx.setNode(node);
    return () => ctx.setNode(null);
  }, [ctx, node]);
}
