"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastAction = {
  label: string;
  href: string;
};

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Durasi tampil (ms). Default 4000. Set 0 untuk persistent. */
  duration?: number;
  /** Tombol aksi yang menavigasi ke `href` saat di-klik. */
  action?: ToastAction;
};

type ToastInput = Omit<Toast, "id" | "variant"> & { variant?: ToastVariant };
type ToastQuickInput =
  | string
  | { description?: string; action?: ToastAction; duration?: number };

type ToastContextValue = {
  toasts: Toast[];
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, opts?: ToastQuickInput) => string;
  error: (title: string, opts?: ToastQuickInput) => string;
  info: (title: string, opts?: ToastQuickInput) => string;
  warning: (title: string, opts?: ToastQuickInput) => string;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

let counter = 0;
const nextId = () => `t-${Date.now()}-${++counter}`;

function normaliseQuickInput(opts?: ToastQuickInput): {
  description?: string;
  action?: ToastAction;
  duration?: number;
} {
  if (opts == null) return {};
  if (typeof opts === "string") return { description: opts };
  return opts;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = React.useCallback(
    (input: ToastInput) => {
      const id = nextId();
      const toast: Toast = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
        // Default: 6 detik kalau ada action (user perlu waktu klik), 4 detik biasa.
        duration:
          input.duration ?? (input.action ? 6000 : 4000),
        action: input.action,
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration && toast.duration > 0) {
        const timer = setTimeout(() => dismiss(id), toast.duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toasts,
      show,
      dismiss,
      success: (title, opts) => {
        const o = normaliseQuickInput(opts);
        return show({ title, ...o, variant: "success" });
      },
      error: (title, opts) => {
        const o = normaliseQuickInput(opts);
        return show({
          title,
          ...o,
          variant: "error",
          duration: o.duration ?? 6000,
        });
      },
      info: (title, opts) => {
        const o = normaliseQuickInput(opts);
        return show({ title, ...o, variant: "info" });
      },
      warning: (title, opts) => {
        const o = normaliseQuickInput(opts);
        return show({ title, ...o, variant: "warning" });
      },
    }),
    [toasts, show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return ctx;
}

function ToastViewport() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return null;
  return (
    <div
      role="region"
      aria-label="Notifikasi"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-4 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
    >
      {ctx.toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => ctx.dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const { Icon, color } = ICONS[toast.variant];
  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm gap-3 rounded-lg border bg-card p-3 shadow-lg",
        color,
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {toast.description}
          </p>
        ) : null}
        {toast.action ? (
          <Link
            href={toast.action.href}
            onClick={onDismiss}
            className="mt-2 inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {toast.action.label}
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup notifikasi"
        className="flex-shrink-0 self-start rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const ICONS: Record<
  ToastVariant,
  { Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; color: string }
> = {
  success: {
    Icon: CheckCircle2,
    color: "border-emerald-500/40 [&_svg]:text-emerald-500",
  },
  error: {
    Icon: TriangleAlert,
    color: "border-destructive/40 [&_svg]:text-destructive",
  },
  warning: {
    Icon: TriangleAlert,
    color: "border-warning/40 [&_svg]:text-warning",
  },
  info: { Icon: Info, color: "border-border [&_svg]:text-foreground" },
};
