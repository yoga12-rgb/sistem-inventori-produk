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
  /** Version counter — berubah setiap kali nodes ditambah/dihapus. */
  version: number;
  /** Ref-based storage — tidak trigger re-render provider saat nilainya berubah. */
  nodesRef: React.MutableRefObject<Map<string, React.ReactNode>>;
};

const PageActionContext = React.createContext<Ctx | null>(null);

export function PageActionSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const nodesRef = React.useRef<Map<string, React.ReactNode>>(new Map());
  const [version, setVersion] = React.useState(0);

  const register = React.useCallback((key: string, node: React.ReactNode) => {
    const prev = nodesRef.current;
    // Cek apakah node benar-benar berubah (hindari loop).
    if (prev.get(key) === node) return;
    const next = new Map(prev);
    next.set(key, node);
    nodesRef.current = next;
    setVersion((v) => v + 1);
  }, []);

  const unregister = React.useCallback((key: string) => {
    const prev = nodesRef.current;
    if (!prev.has(key)) return;
    const next = new Map(prev);
    next.delete(key);
    nodesRef.current = next;
    setVersion((v) => v + 1);
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({ register, unregister, version, nodesRef }),
    [register, unregister, version],
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
  if (!ctx /* eslint-disable-next-line react-hooks/rules-of-hooks */)
    return null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  // Subscribe ke version counter untuk re-render.
  const versionRef = React.useRef(ctx.version);
  if (versionRef.current !== ctx.version) {
    versionRef.current = ctx.version;
    forceUpdate();
  }

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
    // node excluded from deps — jika parent membuat node baru tiap render
    // kita tetap pakai identity check di dalam register().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, stableKey]);
}
