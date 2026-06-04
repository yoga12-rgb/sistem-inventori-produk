/**
 * Helper format tanggal & angka, dipakai bersama oleh server & client komponen.
 *
 * Semua tanggal bisnis memakai timezone Asia/Jakarta supaya hasil server
 * (mis. Vercel UTC) dan browser tetap konsisten.
 */

export const JAKARTA_TIME_ZONE = "Asia/Jakarta";

const DASH = "—";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MONTH_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  day: "2-digit",
  month: "short",
});

const DATE_LONG_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const JAKARTA_DATE_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: JAKARTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const NUMBER_FMT = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3,
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const date = typeof value === "string" ? new Date(value) : value;
  return DATE_FMT.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const date = typeof value === "string" ? new Date(value) : value;
  return DATE_TIME_FMT.format(date);
}

export function formatDayMonth(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const date = typeof value === "string" ? new Date(value) : value;
  return DAY_MONTH_FMT.format(date);
}

export function formatJakartaDateLong(dateIso: string): string {
  const date = parseJakartaDate(dateIso);
  if (!date) return dateIso;
  return DATE_LONG_FMT.format(date);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return NUMBER_FMT.format(value);
}

export function formatQty(
  value: number | null | undefined,
  unit?: string | null,
): string {
  const num = formatNumber(value);
  if (num === DASH) return num;
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

export function todayJakartaIso(now = new Date()): string {
  const parts = JAKARTA_DATE_PARTS_FMT.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) {
    throw new Error("Unable to format Jakarta date.");
  }
  return `${year}-${month}-${day}`;
}

export function parseJakartaDate(dateIso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const date = new Date(`${dateIso}T00:00:00+07:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isValidJakartaDate(dateIso: string): boolean {
  return parseJakartaDate(dateIso) !== null;
}

export function shiftJakartaDate(dateIso: string, days: number): string {
  const date = parseJakartaDate(dateIso);
  if (!date) return dateIso;
  date.setUTCDate(date.getUTCDate() + days);
  return todayJakartaIso(date);
}

export function jakartaDayRangeIso(dateIso: string): {
  start: string;
  end: string;
} {
  const start = parseJakartaDate(dateIso);
  if (!start) {
    throw new Error(`Invalid Jakarta date: ${dateIso}`);
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
