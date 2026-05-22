import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferCreateForm } from "./transfer-create-form";
import { requireUser } from "@/lib/auth";
import { getMasterData } from "@/lib/master-data";

export const metadata = { title: "Buat Transfer — Sistem Inventaris" };

export default async function NewTransferPage() {
  const me = await requireUser();
  const isAdmin = me.profile?.role === "super_admin";

  // Master di-cache di layout. Page menentukan ID asal yang ALLOWED dan
  // default — TransferCreateForm membaca daftar lokasi dari provider.
  const { locations } = await getMasterData();
  const allowedFrom = isAdmin
    ? locations
    : locations.filter((l) => l.id === me.profile?.outlet_id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/transfer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buat transfer</CardTitle>
        </CardHeader>
        <CardContent>
          <TransferCreateForm
            allowedFromIds={allowedFrom.map((l) => l.id)}
            defaultFromId={
              allowedFrom.find((l) => l.id === me.profile?.outlet_id)?.id ??
              allowedFrom[0]?.id ??
              null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
