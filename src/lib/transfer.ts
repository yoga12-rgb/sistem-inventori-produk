import type { ComponentProps } from "react";
import type { Badge } from "@/components/ui/badge";

export type TransferStatus =
  | "pending"
  | "in_transit"
  | "received"
  | "cancelled"
  | "rejected";

export type TransferMode = "one_way" | "two_way";

const STATUS_LABELS: Record<TransferStatus, string> = {
  pending: "Menunggu konfirmasi",
  in_transit: "Dalam perjalanan",
  received: "Diterima",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const STATUS_VARIANTS: Record<TransferStatus, BadgeVariant> = {
  pending: "warning",
  in_transit: "default",
  received: "success",
  cancelled: "muted",
  rejected: "danger",
};

export function transferStatusLabel(s: TransferStatus): string {
  return STATUS_LABELS[s];
}

export function transferStatusVariant(s: TransferStatus): BadgeVariant {
  return STATUS_VARIANTS[s];
}

export function transferModeLabel(m: TransferMode): string {
  return m === "one_way" ? "One-way" : "Two-way";
}
