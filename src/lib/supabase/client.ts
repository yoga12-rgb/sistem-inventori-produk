"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Browser-side Supabase client. Use inside Client Components and hooks.
 *
 * For Realtime subscriptions, instantiate once per component lifecycle
 * and clean up the channel in a `useEffect` return.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
