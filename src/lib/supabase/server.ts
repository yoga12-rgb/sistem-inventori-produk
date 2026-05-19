import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Server-side Supabase client (RSC, Server Actions, Route Handlers).
 *
 * NOTE: Next.js 16 removed sync access to `cookies()`. We `await` it here
 * and forward writes back to the response cookie store so Supabase Auth
 * can refresh tokens transparently.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // The `set` method was called from a Server Component; ignore.
          // Token refresh is then handled by the proxy (proxy.ts).
        }
      },
    },
  });
}
