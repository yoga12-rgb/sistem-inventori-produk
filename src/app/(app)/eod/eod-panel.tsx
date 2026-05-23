"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMasterData } from "@/components/master-data-provider";
import { cn } from "@/lib/utils";

type SoldItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
};

type StockBatchSummary = { date: string; qty: number };
type StockItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  total: number;
  batches: StockBatchSummary[];
};

type DisposalCategory =
  | "expired"
  | "compliment"
  | "tester"
  | "damage"
  | "adjustment";
type DisposalItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
};

type EodReport = {
  sold: SoldItem[];
  disposal?: Partial<Record<DisposalCategory, DisposalItem[]>>;
  stock_now: StockItem[];
};

type TransferLine = {
  code: string;
  product_name: string;
  quantity: number;
  unit: string;
  from_name: string;
  to_name: string;
  status: string;
};

const DISPOSAL_ORDER: DisposalCategory[] = [
  "expired",
  "compliment",
  "tester",
  "damage",
];

const DISPOSAL_LABEL: Record<DisposalCategory, string> = {
  expired: "Expired",
  compliment: "Compliment",
  tester: "Tester",
  damage: "Rusak",
  adjustment: "Adjustment",
};

const DISPOSAL_EMOJI: Record<DisposalCategory, string> = {
  expired: "❌",
  compliment: "🎁",
  tester: "🧪",
  damage: "🗑️",
  adjustment: "🔧",
};

const DATE_FILTER_KEY = "eod-panel:date";
const TRANSFER_TOGGLE_KEY = "eod-panel:include-transfer";

function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatBatchDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Buat map product_id → category_sort dari master data.
 * Produk tanpa kategori diberi sort = 999 agar muncul paling akhir.
 */
function buildProductSortMap(
  products: Array<{ id: string; category_id: string | null }>,
  categories: Array<{ id: string; sort: number }>,
): Map<string, number> {
  const catSort = new Map<string, number>();
  for (const c of categories) catSort.set(c.id, c.sort);

  const result = new Map<string, number>();
  for (const p of products) {
    result.set(p.id, p.category_id ? (catSort.get(p.category_id) ?? 999) : 999);
  }
  return result;
}

function buildWaText(
  outletName: string,
  date: string,
  data: EodReport,
  transfers: TransferLine[],
  includeTransfer: boolean,
  master: ReturnType<typeof useMasterData>,
): string {
  const header = `Laporan Stock Abon Gulung Outlet ${outletName}`;
  const dateLine = formatDateLong(date);

  // Urut berdasarkan kategori sort, lalu nama produk
  const productSort = buildProductSortMap(master.products, master.categories);
  const sortFn = (a: { product_id: string; name: string }) => {
    const cat = productSort.get(a.product_id) ?? 999;
    return `${String(cat).padStart(3, "0")}-${a.name}`;
  };

  const sortedSold = [...data.sold].sort((a, b) =>
    sortFn(a).localeCompare(sortFn(b)),
  );
  const sortedStock = [...data.stock_now].sort((a, b) =>
    sortFn(a).localeCompare(sortFn(b)),
  );

  // ── STOCK TERJUAL ──
  const soldLines =
    sortedSold.length > 0
      ? sortedSold
          .map(
            (s) =>
              `✅ ${s.name} : ${formatNumber(Number(s.quantity))} ${s.unit}`,
          )
          .join("\n")
      : "Tidak ada transaksi.";

  const totalSoldQty = sortedSold.reduce(
    (sum, s) => sum + Number(s.quantity),
    0,
  );
  const totalUnit = sortedSold.length > 0 ? sortedSold[0].unit : "pcs";
  const totalLine = `Total : (${formatNumber(totalSoldQty)} ${totalUnit})`;

  // ── STOCK UPDATE ──
  const stockLines =
    sortedStock.length > 0
      ? sortedStock
          .map((s) => {
            const head = `✅ ${s.name} : ${formatNumber(Number(s.total))} ${s.unit}`;
            const sub = s.batches
              .map(
                (b) =>
                  `  Tanggal ${formatBatchDate(b.date)} : ${formatNumber(Number(b.qty))} ${s.unit}`,
              )
              .join("\n");
            return [head, sub].filter(Boolean).join("\n");
          })
          .join("\n")
      : "Stok kosong.";

  // ── DISPOSAL ──
  const disposalEntries = DISPOSAL_ORDER.flatMap<
    [DisposalCategory, DisposalItem[]]
  >((cat) => {
    const items = data.disposal?.[cat];
    return items && items.length > 0 ? [[cat, items]] : [];
  });

  const disposalLines =
    disposalEntries.length > 0
      ? disposalEntries
          .map(([cat, items]) => {
            const head = `${DISPOSAL_EMOJI[cat]} ${DISPOSAL_LABEL[cat]}`;
            const sub = items
              .map(
                (i) =>
                  `  ✅ ${i.name} : ${formatNumber(Number(i.quantity))} ${i.unit}`,
              )
              .join("\n");
            return [head, sub].filter(Boolean).join("\n");
          })
          .join("\n")
      : null;

  // ── TRANSFER STOCK ──
  const transferLines =
    includeTransfer && transfers.length > 0
      ? transfers
          .map(
            (t) =>
              `✅ ${t.product_name} : ${formatNumber(Number(t.quantity))} ${t.unit} (${t.from_name} → ${t.to_name})`,
          )
          .join("\n")
      : null;

  // ── BUILD SECTIONS ──
  const sections: string[] = [
    header,
    dateLine,
    "",
    "‎STOCK TERJUAL:",
    soldLines,
    "",
    totalLine,
    "",
    "‎✨ STOCK UPDATE:",
    stockLines,
  ];

  if (disposalLines) {
    sections.push("", "Disposal :", disposalLines);
  }

  if (transferLines) {
    sections.push("", "Transfer stock :", transferLines);
  }

  return sections.join("\n");
}

export function EodPanel({
  allowedOutletIds,
  defaultOutletId,
}: {
  allowedOutletIds: string[];
  defaultOutletId: string;
}) {
  const master = useMasterData();
  const allowedSet = useMemo(
    () => new Set(allowedOutletIds),
    [allowedOutletIds],
  );
  const outlets = useMemo(
    () =>
      master.locations.filter(
        (l) => l.type === "outlet" && allowedSet.has(l.id),
      ),
    [master.locations, allowedSet],
  );

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [outletId, setOutletId] = useState<string>(defaultOutletId);
  const [date, setDate] = useState<string>(() => {
    if (typeof window === "undefined") return todayLocalIso();
    return window.localStorage.getItem(DATE_FILTER_KEY) ?? todayLocalIso();
  });
  const [includeTransfer, setIncludeTransfer] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(TRANSFER_TOGGLE_KEY) !== "0";
  });
  const [report, setReport] = useState<EodReport | null>(null);
  const [transfers, setTransfers] = useState<TransferLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  const outlet = outlets.find((o) => o.id === outletId);

  // Persist filter tanggal + toggle transfer
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DATE_FILTER_KEY, date);
  }, [date]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      TRANSFER_TOGGLE_KEY,
      includeTransfer ? "1" : "0",
    );
  }, [includeTransfer]);

  const loadData = useCallback(async () => {
    if (!outletId || !date) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch EOD report
      const { data: eodData, error: eodErr } = await supabase.rpc(
        "fn_eod_report",
        {
          p_location_id: outletId,
          p_date: date,
        },
      );
      if (eodErr) {
        setError(eodErr.message);
        setLoading(false);
        return;
      }
      setReport(
        (eodData as EodReport) ?? { sold: [], disposal: {}, stock_now: [] },
      );

      // 2. Fetch transfer history — outlet ini sbg pengirim/penerima tgl tsb
      // Catatan: Supabase FK join mengembalikan array (meski FK tunggal)
      const { data: transferData } = await supabase
        .from("transfers")
        .select(
          `
          code,
          status,
          from_location:from_location_id ( name ),
          to_location:to_location_id ( name ),
          transfer_items (
            quantity,
            product:product_id ( name, unit )
          )
        `,
        )
        .or(`from_location_id.eq.${outletId},to_location_id.eq.${outletId}`)
        .eq("status", "received")
        .gte("created_at", `${date} 00:00:00+07`)
        .lte("created_at", `${date} 23:59:59+07`)
        .order("created_at", { ascending: true });

      const lines: TransferLine[] = [];
      if (transferData) {
        const raw = transferData as Array<{
          code: string;
          status: string;
          // Supabase FK join returns array even for singular FK
          from_location: Array<{ name: string }>;
          to_location: Array<{ name: string }>;
          transfer_items: Array<{
            quantity: number;
            // FK join inside transfer_items also returns array
            product: Array<{ name: string; unit: string }>;
          }>;
        }>;
        for (const t of raw) {
          const fromName = t.from_location?.[0]?.name ?? "";
          const toName = t.to_location?.[0]?.name ?? "";
          for (const item of t.transfer_items) {
            const prod = item.product?.[0];
            lines.push({
              code: t.code,
              product_name: prod?.name ?? "—",
              quantity: Number(item.quantity),
              unit: prod?.unit ?? "",
              from_name: fromName,
              to_name: toName,
              status: t.status,
            });
          }
        }
      }
      setTransfers(lines);
    } catch (err) {
      setError(String(err));
    }

    setLoading(false);
  }, [supabase, outletId, date]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadData();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadData]);

  const text = useMemo(() => {
    if (!report || !outlet) return "";
    return buildWaText(
      outlet.name,
      date,
      report,
      transfers,
      includeTransfer,
      master,
    );
  }, [report, outlet, date, transfers, includeTransfer, master]);

  const disposalCount = useMemo(() => {
    if (!report?.disposal) return 0;
    return DISPOSAL_ORDER.reduce(
      (sum, cat) => sum + (report.disposal?.[cat]?.length ?? 0),
      0,
    );
  }, [report]);

  const totalSoldQty = useMemo(
    () => report?.sold.reduce((sum, s) => sum + Number(s.quantity), 0) ?? 0,
    [report],
  );

  const waUrl = text ? `https://wa.me/?text=${encodeURIComponent(text)}` : "#";

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Outlet</span>
          <Select
            value={outletId}
            onChange={(e) => setOutletId(e.currentTarget.value)}
            className="min-w-60"
            disabled={outlets.length === 1}
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tanggal</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-base"
          />
        </label>
        <Button variant="outline" size="sm" onClick={() => void loadData()}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Muat ulang
        </Button>
      </div>

      {/* Checkbox untuk transfer stock */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeTransfer}
          onChange={(e) => setIncludeTransfer(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        Sertakan riwayat Transfer stock dalam laporan
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Pratinjau pesan WhatsApp</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-sans text-sm leading-6">
              {text || (loading ? "Memuat…" : "Tidak ada data.")}
            </pre>
            <div className="flex flex-wrap gap-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!text}
                className={cn(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                  !text && "pointer-events-none opacity-60",
                )}
              >
                <Share2 className="h-4 w-4" />
                Bagikan ke WhatsApp
              </a>
              <Button variant="outline" onClick={handleCopy} disabled={!text}>
                <Copy className="h-4 w-4" />
                {copyOk ? "Tersalin" : "Salin teks"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tombol akan membuka WhatsApp; pilih kontak / grup tujuan secara
              manual.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>
                STOCK TERJUAL{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({report?.sold.length ?? 0} produk)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!report || report.sold.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada transaksi.
                </p>
              ) : (
                <div className="space-y-2">
                  <ul className="divide-y">
                    {report.sold.map((s) => (
                      <li
                        key={s.product_id}
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <span>✅ {s.name}</span>
                        <span className="font-medium tabular-nums">
                          {formatNumber(Number(s.quantity))} {s.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t pt-2 text-right text-sm font-semibold">
                    Total : ({formatNumber(totalSoldQty)}{" "}
                    {report.sold.length > 0 ? report.sold[0].unit : "box/pcs"})
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>
                Disposal{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({disposalCount} produk)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {disposalCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada barang yang dibuang.
                </p>
              ) : (
                <ul className="space-y-3">
                  {DISPOSAL_ORDER.map((cat) => {
                    const items = report?.disposal?.[cat] ?? [];
                    if (items.length === 0) return null;
                    return (
                      <li key={cat}>
                        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {DISPOSAL_EMOJI[cat]} {DISPOSAL_LABEL[cat]}
                        </div>
                        <ul className="mt-1 divide-y">
                          {items.map((i) => (
                            <li
                              key={`${cat}-${i.product_id}`}
                              className="flex items-center justify-between py-1.5 text-sm"
                            >
                              <span>✅ {i.name}</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(Number(i.quantity))} {i.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>
                Stok akhir{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({report?.stock_now.length ?? 0} produk)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!report || report.stock_now.length === 0 ? (
                <p className="text-sm text-muted-foreground">Stok kosong.</p>
              ) : (
                <ul className="space-y-3">
                  {report.stock_now.map((s) => (
                    <li key={s.product_id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">✅ {s.name}</span>
                        <span className="tabular-nums">
                          {formatNumber(Number(s.total))} {s.unit}
                        </span>
                      </div>
                      <ul className="mt-1 ml-4 space-y-0.5 text-xs text-muted-foreground">
                        {s.batches.map((b, i) => (
                          <li
                            key={`${b.date}-${i}`}
                            className="flex items-center justify-between"
                          >
                            <span>Tanggal {formatBatchDate(b.date)}</span>
                            <span className="tabular-nums">
                              {formatNumber(Number(b.qty))} {s.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
