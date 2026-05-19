"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/**
 * Saat URL punya `?ok=1` setelah server action selesai, munculkan toast lalu
 * bersihkan query string supaya refresh tidak munculkan ulang.
 */
export function SaleSuccessToast() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ok = searchParams.get("ok");

  useEffect(() => {
    if (ok !== "1") return;
    toast.success("Transaksi tercatat", "Stok telah dipotong otomatis.");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("ok");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?");
  }, [ok, toast, router, searchParams]);

  return null;
}
