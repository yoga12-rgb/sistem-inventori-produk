import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  full_name: string;
  role: "super_admin" | "cashier";
  outlet_id: string | null;
  is_active: boolean;
};

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: Profile | null;
};

/**
 * Read the current Supabase user + profile. Returns null if not signed in.
 * Use in pages where the proxy guard already runs and you just need data.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, outlet_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    profile: (profile as Profile | null) ?? null,
  };
}

/**
 * Assert the current user is a Super Admin. Redirects to "/" otherwise.
 * Throws if no session — but that should never happen because `proxy.ts`
 * already gates non-public routes.
 */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.profile) redirect("/logout");
  if (!user.profile.is_active) redirect("/logout");
  if (user.profile.role !== "super_admin") {
    redirect("/");
  }
  return user;
}

/**
 * Assert the current user is signed in (proxy already enforces this; we use
 * this for app pages that don't require an admin role).
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.profile) redirect("/logout");
  if (!user.profile.is_active) redirect("/logout");
  return user;
}
