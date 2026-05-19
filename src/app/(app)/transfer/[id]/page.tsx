import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransferActions } from "./transfer-actions";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  transferModeLabel,
  transferStatusLabel,
  transferStatusVariant,
  type TransferMode,
  type TransferStatus,
} from "@/lib/transfer";

export const metadata = { title: "Detail Transfer — Sistem Inventaris" };

type Detail = {
  id: string;
  code: string;
  mode: TransferMode;
  status: TransferStatus;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  from_location_id: string;
  to_location_id: string;
  from_location: { code: string; name: string } | null;
  to_location: { code: string; name: string } | null;
  created_by: { full_name: string } | null;
  confirmed_by: { full_name: string } | null;
  items: {
    id: string;
    quantity: number;
    product: {
      sku: string;
      name: string;
      unit: string;
      is_perishable: boolean;
    } | null;
    source_batch: {
      id: string;
      produced_at: string;
      expires_at: string | null;
    } | null;
    destination_batch: { id: string } | null;
  }[];
};

export default async function TransferDetailPage({
  params,
}: PageProps<"/transfer/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("transfers")
    .select(
      `
        id, code, mode, status, notes,
        created_at, shipped_at, received_at,
        from_location_id, to_location_id,
        from_location:locations!transfers_from_location_id_fkey(code, name),
        to_location:locations!transfers_to_location_id_fkey(code, name),
        created_by:profiles!transfers_created_by_fkey(full_name),
        confirmed_by:profiles!transfers_confirmed_by_fkey(full_name),
        items:transfer_items(
          id, quantity,
          product:products(sku, name, unit, is_perishable),
          source_batch:stock_batches!transfer_items_source_batch_id_fkey(id, produced_at, expires_at),
          destination_batch:stock_batches!transfer_items_destination_batch_id_fkey(id)
        )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }
  if (!data) notFound();

  const t = data as unknown as Detail;
  const isAdmin = me.profile?.role === "super_admin";
  const myOutlet = me.profile?.outlet_id ?? null;
  const canSend = myOutlet === t.from_location_id;
  const canReceive = myOutlet === t.to_location_id;

  const totalQty = t.items.reduce((sum, i) => sum + Number(i.quantity), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/transfer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Daftar transfer
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Transfer
            </p>
            <CardTitle className="font-mono text-base">{t.code}</CardTitle>
            <CardDescription>
              {t.from_location?.code} ({t.from_location?.name}) →{" "}
              {t.to_location?.code} ({t.to_location?.name})
            </CardDescription>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{transferModeLabel(t.mode)}</Badge>
              <Badge variant={transferStatusVariant(t.status)}>
                {transferStatusLabel(t.status)}
              </Badge>
            </div>
            <TransferActions
              id={t.id}
              status={t.status}
              mode={t.mode}
              canSend={canSend}
              canReceive={canReceive}
              isAdmin={isAdmin}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Dibuat" value={formatDateTime(t.created_at)} />
          <Meta
            label="Dikirim"
            value={t.shipped_at ? formatDateTime(t.shipped_at) : "—"}
          />
          <Meta
            label="Diterima"
            value={t.received_at ? formatDateTime(t.received_at) : "—"}
          />
          <Meta label="Total qty" value={formatNumber(totalQty)} />
          <Meta label="Pembuat" value={t.created_by?.full_name ?? "—"} />
          <Meta
            label="Diproses oleh"
            value={t.confirmed_by?.full_name ?? "—"}
          />
          {t.notes ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Catatan
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{t.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item ({t.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Batch sumber</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Batch tujuan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="font-medium">
                        {it.product?.name ?? "—"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {it.product?.sku}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {it.source_batch ? (
                        <div className="space-y-0.5">
                          <div>
                            Produksi {formatDateTime(it.source_batch.produced_at)}
                          </div>
                          {it.product?.is_perishable && it.source_batch.expires_at ? (
                            <div className="text-xs">
                              Exp {formatDate(it.source_batch.expires_at)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNumber(Number(it.quantity))}{" "}
                      <span className="text-muted-foreground">
                        {it.product?.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {it.destination_batch ? (
                        <Badge variant="success">Sudah dibuat</Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          Menunggu
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
