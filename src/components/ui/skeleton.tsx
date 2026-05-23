import { cn } from "@/lib/utils";

/**
 * Base skeleton block dengan animate-pulse.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/**
 * Skeleton untuk satu baris tabel.
 */
export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === 0 ? "w-24" : i === cols - 1 ? "w-16 ml-auto" : "flex-1",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton untuk tabel penuh (header + rows).
 */
export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              "h-3",
              i === 0 ? "w-24" : i === cols - 1 ? "w-16 ml-auto" : "flex-1",
            )}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <SkeletonTableRow key={r} cols={cols} />
      ))}
    </div>
  );
}

/**
 * Skeleton untuk satu kartu (stat card).
 */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-md" />
      </div>
      <Skeleton className="mt-4 h-4 w-28" />
    </div>
  );
}

/**
 * Skeleton untuk form sederhana.
 */
export function SkeletonForm() {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex justify-end gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  );
}
