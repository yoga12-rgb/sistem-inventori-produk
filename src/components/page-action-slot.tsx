"use client";

import * as React from "react";

/**
 * Context untuk render tombol aksi primer halaman (mis. "Tambah Outlet",
 * "Buat Transfer") di top bar global, bukan di header halaman.
 *
 * Pemakaian:
 *   - AppShell membungkus tree dengan <PageActionSlotProvider/>
 *   - AppShell merender slot output via <PageActionSlotOutlet/>
 *   - Page component memanggil hook usePageAction(node) / usePageAction(node, key)
 *     untuk mendaftar. Saat unmount, registrasi otomatis dibersihkan.
 *
 * Multi-action: gunakan `key` berbeda untuk tiap <RegisterPageAction>.
 * Jika tidak diberikan key, digunakan auto-increment counter.
 */

type Ctx = {
  register: (key: string, node: React.ReactNode) => void;
  unregister: (key: string) => void;
  nodes: Map<string, React.ReactNode>;
};

const PageActionContext = React.createContext<Ctx | null>(null);

export function PageActionSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [nodes, setNodes] = React.useState<Map<string, React.ReactNode>>(
    new Map(),
  );

  const register = React.useCallback((key: string, node: React.ReactNode) => {
    setNodes((prev) => {
      const next = new Map(prev);
      next.set(key, node);
      return next;
    });
  }, []);

  const unregister = React.useCallback((key: string) => {
    setNodes((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({ register, unregister, nodes }),
    [register, unregister, nodes],
  );

  return (
    <PageActionContext.Provider value={value}>
      {children}
    </PageActionContext.Provider>
  );
}

/** Render slot di tempat yang diinginkan (mis. top bar). */
export function PageActionSlotOutlet() {
  const ctx = React.useContext(PageActionContext);
  if (!ctx || ctx.nodes.size === 0) return null;
  return (
    <>
      {Array.from(ctx.nodes.values()).map((node, i) => (
        <React.Fragment key={i}>{node}</React.Fragment>
      ))}
    </>
  );
}

let _nextKey = 0;

/**
 * Mendaftarkan tombol aksi yang akan dirender di top bar global.
 * Hanya dipakai dari Client Component.
 *
 * @param node - React node yang akan dirender di top bar.
 * @param key  - Identifier unik (opsional). Berguna jika halaman
 *               memiliki beberapa tombol aksi sekaligus.
 */
export function usePageAction(node: React.ReactNode, key?: string) {
  const ctx = React.useContext(PageActionContext);

  // Stable key: user-provided atau auto-increment.
  const stableKey = React.useMemo(() => {
    if (key) return key;
    return `_pa_${++_nextKey}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!ctx) return;
    ctx.register(stableKey, node);
    return () => ctx.unregister(stableKey);
  }, [ctx, node, stableKey]);
}
