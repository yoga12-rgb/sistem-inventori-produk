"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ESTIMATED_ROW_HEIGHT = 57;
const MIN_PAGE_SIZE = 8;
const OVERSCAN_ROWS = 4;

type Column = {
  key: string;
  label: React.ReactNode;
  className?: string;
};

export function ViewportTable<T>({
  rows,
  columns,
  filters,
  empty,
  getRowKey,
  renderRow,
  rowEstimate = ESTIMATED_ROW_HEIGHT,
}: {
  rows: T[];
  columns: Column[];
  filters?: React.ReactNode;
  empty: React.ReactNode;
  getRowKey: (row: T) => string;
  renderRow: (row: T) => React.ReactNode;
  rowEstimate?: number;
}) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisibleCount(pageSize ?? 0);
    }, 0);
    return () => clearTimeout(timer);
  }, [pageSize, rows]);

  useEffect(() => {
    const node = scrollAreaRef.current;
    if (!node) return;

    let frame: number | null = null;
    const measure = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const visibleRows = Math.ceil(node.clientHeight / rowEstimate);
        const next = Math.max(MIN_PAGE_SIZE, visibleRows + OVERSCAN_ROWS);
        setPageSize((prev) => (prev === next ? prev : next));
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(node);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [rowEstimate]);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = scrollAreaRef.current;
    if (!node || !root || pageSize === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(rows.length, current + pageSize));
      },
      { root, rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pageSize, rows.length]);

  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[26rem] flex-col gap-4 lg:h-[calc(100dvh-8rem)]">
      {filters ? (
        <div className="sticky top-0 z-20 flex-shrink-0 bg-background pb-2">
          {filters}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="min-h-0 flex-1 rounded-xl border bg-card p-6">
          {empty}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
          <div ref={scrollAreaRef} className="h-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={cn(
                        "sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]",
                        col.className,
                      )}
                    >
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSize === null
                  ? Array.from({ length: MIN_PAGE_SIZE }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={columns.length} className="py-4">
                          <div className="h-5 animate-pulse rounded bg-muted" />
                        </TableCell>
                      </TableRow>
                    ))
                  : visibleRows.map((row) => (
                      <TableRow key={getRowKey(row)}>
                        {renderRow(row)}
                      </TableRow>
                    ))}
              </TableBody>
            </table>

            <div ref={sentinelRef} className="h-6" />
            {pageSize !== null ? (
              <div className="flex justify-center px-3 pb-4 text-sm text-muted-foreground">
                {visibleCount < rows.length
                  ? "Gulir tabel untuk memuat lagi"
                  : "Semua data sudah dimuat"}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
