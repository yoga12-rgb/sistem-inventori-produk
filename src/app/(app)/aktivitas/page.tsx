import { AktivitasBoard } from "./aktivitas-board";
import { requireSuperAdmin } from "@/lib/auth";

export const metadata = { title: "Aktivitas — Sistem Inventaris" };

export default async function AktivitasPage() {
  await requireSuperAdmin();

  return <AktivitasBoard />;
}
