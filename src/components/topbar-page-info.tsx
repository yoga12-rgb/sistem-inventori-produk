"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Info, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { resolvePageInfo } from "@/lib/page-info-data";
import { cn } from "@/lib/utils";

const HINT_PREFIX = "page-info-hint:";

/** Set in-flight di module level — guard saat ada >1 instance TopbarPageInfo
 * dipasang bersamaan (mis. mobile + desktop top bar yang keduanya ter-mount
 * meski hanya satu yang visible). Tanpa ini, dua effect bisa race dan
 * melempar toast dobel sebelum localStorage di-set. */
const hintShownThisSession = new Set<string>();

/**
 * Judul halaman + ikon ⓘ untuk dipasang di top bar global.
 * Resolusi konten panduan via `resolvePageInfo(pathname)`.
 *
 * Saat user pertama kali masuk ke route tertentu, toast tip muncul sekali
 * (tersimpan di localStorage per route id).
 */
export function TopbarPageInfo({ className }: { className?: string }) {
  const pathname = usePathname();
  const info = resolvePageInfo(pathname);

  const [open, setOpen] = React.useState(false);
  const toast = useToast();

  const hintKey = `${HINT_PREFIX}${pathname}`;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (hintShownThisSession.has(hintKey)) return;
    if (window.localStorage.getItem(hintKey)) return;

    // Mark in-flight & persist SECARA SINKRON sebelum delay supaya instance
    // lain (mis. top bar lain di breakpoint berbeda) langsung skip.
    hintShownThisSession.add(hintKey);
    try {
      window.localStorage.setItem(hintKey, "1");
    } catch {
      /* ignore */
    }

    const t = setTimeout(() => {
      toast.info("Tip", "Tap ikon ⓘ di samping judul untuk panduan halaman.");
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey]);

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <h1 className="truncate text-base font-semibold leading-none sm:text-lg">
        {info.title}
      </h1>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Tentang halaman ini"
        title="Tentang halaman ini"
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Info className="h-4 w-4" />
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={info.title}
        description={info.summary}
        className="max-w-lg"
      >
        <div className="space-y-5">
          {info.eyebrow ? (
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {info.eyebrow}
            </p>
          ) : null}

          {info.features.length > 0 ? (
            <section>
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Fitur utama
              </h3>
              <ul className="space-y-2">
                {info.features.map((f) => (
                  <li
                    key={f.title}
                    className="rounded-md border bg-muted/20 px-3 py-2"
                  >
                    <div className="text-sm font-medium">{f.title}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {f.desc}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {info.shortcuts && info.shortcuts.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Shortcut keyboard</h3>
              <ul className="space-y-1.5">
                {info.shortcuts.map((s) => (
                  <li
                    key={s.desc}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-muted-foreground">{s.desc}</span>
                    <span className="inline-flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <React.Fragment key={`${k}-${i}`}>
                          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                            {k}
                          </kbd>
                          {i < s.keys.length - 1 ? (
                            <span className="text-muted-foreground">+</span>
                          ) : null}
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {info.tips && info.tips.length > 0 ? (
            <section>
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-warning" />
                Tips
              </h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {info.tips.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Tutup
          </Button>
        </div>
      </Modal>
    </div>
  );
}
