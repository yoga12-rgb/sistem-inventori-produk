"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SheetSide = "right" | "bottom";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  side?: SheetSide;
  className?: string;
  children: React.ReactNode;
};

/**
 * Slide-in panel. Controlled — caller renders its own trigger.
 * Locks scroll, closes on Escape & backdrop click. Respects iOS
 * safe-area inset on the bottom edge.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  className,
  children,
}: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || typeof window === "undefined") return null;

  const sideClasses =
    side === "right"
      ? "right-0 top-0 h-full w-full max-w-sm border-l"
      : "bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-xl border-t";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "sheet-title" : undefined}
      className="fixed inset-0 z-50"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "absolute flex flex-col bg-card text-card-foreground shadow-xl",
          sideClasses,
          className,
        )}
        style={{
          paddingBottom:
            side === "bottom" ? "env(safe-area-inset-bottom)" : undefined,
        }}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <div>
              {title ? (
                <h2 id="sheet-title" className="text-base font-semibold">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Tutup"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
