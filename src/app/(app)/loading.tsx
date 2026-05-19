import { Loader2 } from "lucide-react";

/**
 * Suspense fallback untuk semua halaman privat. Ditampilkan singkat saat
 * Server Component menunggu data (mis. saat navigasi pertama ke halaman).
 */
export default function AppLoading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-label="Memuat" />
    </div>
  );
}
