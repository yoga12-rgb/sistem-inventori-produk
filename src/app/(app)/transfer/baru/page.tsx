import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferCreateForm } from "./transfer-create-form";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Buat Transfer — Sistem Inventaris" };

export default async function NewTransferPage() {
  const me = await requireUser();
  const isAdmin = me.profile?.role === "super_admin";

  const supabase = await createSupabaseServerClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, type")
    .eq("is_active", true)
    .order("code", { ascending: true });

  // Asal yang diperbolehkan: kasir cuma outletnya, admin bebas.
  const allowedFrom = isAdmin
    ? (locations ?? [])
    : (locations ?? []).filter((l) => l.id === me.profile?.outlet_id);

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
            allowedFromLocations={allowedFrom}
            allLocations={locations ?? []}
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
