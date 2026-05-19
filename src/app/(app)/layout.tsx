import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";

/**
 * Layout untuk seluruh halaman privat. proxy.ts sudah memastikan ada session,
 * tapi kita tetap re-check di server agar nav role-aware aman dari race.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email,
        fullName: user.profile?.full_name ?? user.email ?? "Pengguna",
        role: user.profile?.role ?? null,
        outletId: user.profile?.outlet_id ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
