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
 *
 * Arsitektur:
 *   - register/unregister = stable callbacks (useCallback [])
 *   - nodes = disimpan di useRef, tidak trigger re-render
 *   - version = useState bump untuk notifikasi ke outlet via KONTEKS TERPISAH
 *     supaya usePageAction tidak re-run setiap version berubah
 */

type ActionsCtx = {
  register: (key: string, node: React.ReactNode) => void;
  unregister: (key: string) => void;
  nodesRef: React.MutableRefObject<Map<string, React.ReactNode>>;
};

const ActionsContext = React.createContext<ActionsCtx | null>(null);
const VersionContext = React.createContext(0);

export function PageActionSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const nodesRef = React.useRef<Map<string, React.ReactNode>>(new Map());
  const [version, setVersion] = React.useState(0);

  const register = React.useCallback((key: string, node: React.ReactNode) => {
    const prev = nodesRef.current;
    if (!prev.has(key)) {
      // Key baru: bump version agar outlet re-render.
      const next = new Map(prev);
      next.set(key, node);
      nodesRef.current = next;
      setVersion((v) => v + 1);
    } else {
      // Key sudah ada: update node secara in-place. Outlet tidak
      // re-render (konten tombol jarang berubah setelah mount).
      prev.set(key, node);
    }
  }, []);

  const unregister = React.useCallback((key: string) => {
    const prev = nodesRef.current;
    if (!prev.has(key)) return;
    const next = new Map(prev);
    next.delete(key);
    nodesRef.current = next;
    setVersion((v) => v + 1);
  }, []);

  const ctxValue = React.useMemo<ActionsCtx>(
    () => ({ register, unregister, nodesRef }),
    [register, unregister],
  );

  return (
    <ActionsContext.Provider value={ctxValue}>
      <VersionContext.Provider value={version}>
        {children}
      </VersionContext.Provider>
    </ActionsContext.Provider>
  );
}

/** Render slot di tempat yang diinginkan (mis. top bar). */
export function PageActionSlotOutlet() {
  const ctx = React.useContext(ActionsContext);
  // Membaca version dari context terpisah — trigger re-render di sini.
  React.useContext(VersionContext);

  if (!ctx) return null;
  const nodes = ctx.nodesRef.current;
  if (nodes.size === 0) return null;
  return (
    <>
      {Array.from(nodes.values()).map((node, i) => (
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
  const ctx = React.useContext(ActionsContext);

  const stableKey = React.useMemo(() => {
    if (key) return key;
    return `_pa_${++_nextKey}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Destructure untuk referensi stabil — register/unregister adalah
  // useCallback([]) jadi tidak akan berubah sepanjang lifetime.
  const register = ctx?.register;
  const unregister = ctx?.unregister;

  React.useEffect(() => {
    if (!register || !unregister) return;
    register(stableKey, node);
    return () => unregister(stableKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, unregister, stableKey]);
}
