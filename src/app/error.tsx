"use client";

/**
 * Global error boundary. Caught when ANY route throws an unhandled error
 * (Server Component, Client Component, or data fetching).
 */
import { useEffect } from "react";
import { TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log untuk inspeksi di console + reporting tools (kalau di-pasang).
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
        <TriangleAlert className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Terjadi kesalahan</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "Sesuatu tidak berjalan sesuai harapan."}
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            Kode: {error.digest}
          </p>
        ) : null}
      </div>
      <Button onClick={reset}>
        <RefreshCw className="h-4 w-4" />
        Coba lagi
      </Button>
    </main>
  );
}
