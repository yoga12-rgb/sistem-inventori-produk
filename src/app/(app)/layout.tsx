import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MasterDataProvider } from "@/components/master-data-provider";
import { getCurrentUser } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

/**
 * Layout untuk seluruh halaman privat. proxy.ts sudah memastikan ada session,
 * tapi kita tetap re-check di server agar nav role-aware aman dari race.
 *
 * Master data (locations + categories + products) di-fetch sekali di sini
 * dan disebar ke semua child via MasterDataProvider. Konsumen pakai
 * `useMasterData()`. Lihat docs/business-logic.md.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const masterData = await getMasterData();

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
      <MasterDataProvider data={masterData}>{children}</MasterDataProvider>
    </AppShell>
  );
}
