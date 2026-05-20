import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Fallback logout endpoint. Lebih tahan banting daripada server action
 * (yang bisa jadi stale ID-nya setelah HMR / build baru). User cukup buka
 * `/logout` di address bar dan akan di-redirect ke `/login`.
 */
async function handler(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}

export { handler as GET, handler as POST };
