"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Browser-side Supabase client — SINGLETON.
 *
 * Hanya satu instance per tab untuk menghindari race condition refresh token
 * (409 "Too many concurrent token refresh requests").
 *
 * Untuk Realtime subscriptions, gunakan channel per component lifecycle
 * dan bersihkan di `useEffect` return — client-nya tetap yang sama.
 */

let _browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (!_browserClient) {
    _browserClient = createBrowserClient(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey,
    );
  }
  return _browserClient;
}
