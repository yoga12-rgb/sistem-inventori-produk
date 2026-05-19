import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, publicEnv } from "@/lib/env";

/**
 * Service-role Supabase client.
 *
 * SERVER-ONLY. Bypasses RLS — never import into a Client Component or expose
 * via a Route Handler that lacks its own auth check.
 *
 * Used by Super Admin server actions when we need to:
 *   - Create / list auth users (`auth.admin.*`)
 *   - Touch tables across all outlets without scoping to current_user.
 */
export function createSupabaseAdminClient() {
  return createClient(publicEnv.supabaseUrl, getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
