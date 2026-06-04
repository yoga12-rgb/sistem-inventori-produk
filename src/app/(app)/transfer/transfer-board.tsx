"use client";

import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableCell } from "@/components/ui/table";
import { ViewportTable } from "@/components/viewport-table";
import { formatDateTime } from "@/lib/format";
import {
  transferModeLabel,
  transferStatusLabel,
  transferStatusVariant,
  type TransferMode,
  type TransferStatus,
} from "@/lib/transfer";
import { TransferBoxTabs, type BoxKey } from "./box-tabs";
import { TransferListFilters } from "./list-filters";

export type TransferListRow = {
  id: string;
  code: string;
  mode: TransferMode;
  status: TransferStatus;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  from_location: { id: string; code: string; name: string } | null;
  to_location: { id: string; code: string; name: string } | null;
  items: { quantity: number }[];
};

const columns = [
  { key: "code", label: "Kode" },
  { key: "route", label: "Asal -> Tujuan" },
  { key: "mode", label: "Mode" },
  { key: "status", label: "Status" },
  { key: "items", label: "Item", className: "text-right" },
  { key: "created", label: "Dibuat" },
  { key: "actions", label: "Aksi", className: "text-right" },
];

function emptyCopy(box: BoxKey): { title: string; description: string } {
  if (box === "incoming") {
    return {
      title: "Tidak ada transfer masuk",
      description:
        "Tidak ada transfer pending atau dalam perjalanan ke outlet ini.",
    };
  }
  if (box === "outgoing") {
    return {
      title: "Tidak ada transfer keluar",
      description:
        "Tidak ada transfer pending atau dalam perjalanan dari outlet ini.",
    };
  }
  if (box === "history") {
    return {
      title: "Belum ada riwayat",
      description: "Buat transfer pertama dari Central Pastry ke outlet.",
    };
  }
  return {
    title: "Belum ada transfer",
    description: "Buat transfer pertama dari Central Pastry ke outlet.",
  };
}

export function TransferBoard({
  rows,
  box,
  canHaveOutletBoxes,
  defaultOutletId,
}: {
  rows: TransferListRow[];
  box: BoxKey;
  canHaveOutletBoxes: boolean;
  defaultOutletId: string | null;
}) {
  const empty = emptyCopy(box);

  return (
    <ViewportTable
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.id}
      empty={
        <EmptyState
          icon={ArrowLeftRight}
          title={empty.title}
          description={empty.description}
        />
      }
      filters={
        <div className="space-y-4">
          <TransferBoxTabs current={box} canHaveOutletBoxes={canHaveOutletBoxes} />
          {box === "all" ? (
            <TransferListFilters defaultOutletId={defaultOutletId} />
          ) : null}
        </div>
      }
      renderRow={(r) => {
        const totalQty = r.items.reduce(
          (sum, i) => sum + Number(i.quantity),
          0,
        );

        return (
          <>
            <TableCell className="font-mono text-xs">{r.code}</TableCell>
            <TableCell>
              <div className="text-sm">
                <span className="font-medium">
                  {r.from_location?.code ?? "-"}
                </span>
                <span className="mx-1 text-muted-foreground">-&gt;</span>
                <span className="font-medium">
                  {r.to_location?.code ?? "-"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.from_location?.name} -&gt; {r.to_location?.name}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{transferModeLabel(r.mode)}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={transferStatusVariant(r.status)}>
                {transferStatusLabel(r.status)}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.items.length}{" "}
              <span className="text-xs text-muted-foreground">
                ({totalQty})
              </span>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDateTime(r.created_at)}
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/transfer/${r.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Detail
              </Link>
            </TableCell>
          </>
        );
      }}
    />
  );
}
