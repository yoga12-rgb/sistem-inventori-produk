/**
 * Helper format tanggal & angka, dipakai bersama oleh server & client komponen.
 *
 * Catatan: kita pakai Intl agar konsisten antara hasil server (Node) & klien
 * (browser) selama locale & timeZone sama.
 */

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MONTH_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
});

const NUMBER_FMT = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3,
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return DATE_FMT.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return DATE_TIME_FMT.format(date);
}

export function formatDayMonth(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return DAY_MONTH_FMT.format(date);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return NUMBER_FMT.format(value);
}

export function formatQty(
  value: number | null | undefined,
  unit?: string | null,
): string {
  const num = formatNumber(value);
  if (num === "—") return num;
  return unit ? `${num} ${unit}` : num;
}

/**
 * Returns the difference between two timestamps in hours (positive when
 * `to` is after `from`). Useful for expiry calculations on the client.
 */
export function hoursBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}
