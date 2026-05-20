"use client";

import * as React from "react";
import { usePageAction } from "@/components/page-action-slot";

/**
 * Helper kecil untuk halaman Server Component: bungkus tombol/elemen
 * action ke dalam komponen ini supaya ter-register di slot top bar global.
 *
 *   <RegisterPageAction>
 *     <Button>Buat Transfer</Button>
 *   </RegisterPageAction>
 */
export function RegisterPageAction({ children }: { children: React.ReactNode }) {
  usePageAction(children);
  return null;
}
