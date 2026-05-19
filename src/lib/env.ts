/**
 * Centralised access to environment variables, with helpful runtime errors.
 *
 * Public vars (NEXT_PUBLIC_*) ship to the browser and are safe to read on the
 * client. Anything else MUST only be referenced from server code.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
};

/**
 * Returns the Supabase service-role key for SERVER-ONLY admin operations
 * (e.g. creating users via auth.admin.createUser).
 *
 * Throws a friendly error if missing instead of crashing the app at import time
 * — pages that don't need the service role keep working without it.
 */
export function getServiceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
