import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Building2,
  FileText,
  Grid3x3,
  Package,
  Receipt,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.profile?.role === "super_admin";

  // Stat ringkas — tetap jalan walau tabel masih kosong.
  const supabase = await createSupabaseServerClient();
  const [
    { count: outletCount },
    { count: productCount },
    { count: userCount },
    { count: activeBatchCount },
  ] = await Promise.all([
    supabase
      .from("locations")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("stock_batches")
      .select("*", { count: "exact", head: true })
      .gt("remaining_qty", 0),
  ]);

  // Untuk kasir: hitung transfer masuk yang masih menunggu konfirmasi.
  const myOutletId = user?.profile?.outlet_id ?? null;
  let pendingInbox = 0;
  if (myOutletId) {
    const { count } = await supabase
      .from("transfers")
      .select("*", { count: "exact", head: true })
      .eq("to_location_id", myOutletId)
      .in("status", ["pending", "in_transit"]);
    pendingInbox = count ?? 0;
  }

  // Hitung batch perishable yang mendekati expired (dalam ≤ warning_hours
  // produk masing-masing). Filter outlet kasir bila ada; admin lihat semua.
  let expiringSoonCount = 0;
  {
    const now = new Date();
    const nowIso = now.toISOString();
    let q = supabase
      .from("stock_batches")
      .select("id, expires_at, product:products!inner(expiry_warning_hours)")
      .gt("remaining_qty", 0)
      .not("expires_at", "is", null)
      .gte("expires_at", nowIso);
    if (myOutletId) q = q.eq("location_id", myOutletId);
    const { data: batches } = await q.limit(500);
    const nowMs = now.getTime();
    type BatchRow = {
      expires_at: string;
      product: { expiry_warning_hours: number } | { expiry_warning_hours: number }[] | null;
    };
    for (const b of ((batches ?? []) as unknown as BatchRow[])) {
      // Supabase relation join may surface the related row as object or array.
      const product = Array.isArray(b.product) ? b.product[0] : b.product;
      const hoursLeft =
        (new Date(b.expires_at).getTime() - nowMs) / (1000 * 60 * 60);
      if (product && hoursLeft <= Number(product.expiry_warning_hours ?? 24)) {
        expiringSoonCount += 1;
      }
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Dashboard
        </p>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          Halo, {user?.profile?.full_name ?? user?.email ?? "Pengguna"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? "Anda Super Admin. Mulai dengan menyiapkan master data, lalu catat produksi."
            : "Anda Kasir. Lihat stok, lalu lanjut ke transaksi penjualan."}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href="/stok"
          icon={Boxes}
          label="Batch aktif"
          value={activeBatchCount ?? 0}
          cta="Lihat Stok"
        />
        {isAdmin ? (
          <>
            <StatCard
              href="/master/outlets"
              icon={Building2}
              label="Outlet aktif"
              value={outletCount ?? 0}
              cta="Kelola Outlet"
            />
            <StatCard
              href="/master/products"
              icon={Package}
              label="Produk aktif"
              value={productCount ?? 0}
              cta="Kelola Produk"
            />
            <StatCard
              href="/master/users"
              icon={Users}
              label="Akun pengguna"
              value={userCount ?? 0}
              cta="Kelola Pengguna"
            />
          </>
        ) : null}
      </div>

      {expiringSoonCount > 0 ? (
        <Link
          href={myOutletId ? `/stok` : `/stok`}
          className="group flex items-center gap-4 rounded-xl border border-warning/40 bg-warning/10 p-5 shadow-sm transition-colors hover:border-warning"
        >
          <span className="grid h-10 w-10 place-items-center rounded-md bg-warning/20 text-warning-foreground dark:text-amber-300">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {expiringSoonCount} batch mendekati expired
            </div>
            <div className="text-xs text-muted-foreground">
              {myOutletId
                ? "Cek di halaman Stok dan pertimbangkan diskon atau buang."
                : "Cek halaman Stok untuk semua outlet."}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      ) : null}

      {pendingInbox > 0 ? (
        <Link
          href={`/transfer?status=pending&outlet=${myOutletId}`}
          className="group flex items-center gap-4 rounded-xl border border-warning/40 bg-warning/10 p-5 shadow-sm transition-colors hover:border-warning"
        >
          <span className="grid h-10 w-10 place-items-center rounded-md bg-warning/20 text-warning-foreground dark:text-amber-300">
            <ArrowLeftRight className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {pendingInbox} transfer menunggu konfirmasi
            </div>
            <div className="text-xs text-muted-foreground">
              Buka inbox untuk menerima atau menolak.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      ) : null}

      {isAdmin ? (
        <Link
          href="/produksi"
          className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
        >
          <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Catat produksi baru</div>
            <div className="text-xs text-muted-foreground">
              Buat batch perishable di Central Pastry atau pemasukan stok
              non-perishable.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/penjualan"
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
          >
            <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">Catat penjualan</div>
              <div className="text-xs text-muted-foreground">
                Multi-item, FIFO + manual override.
              </div>
            </div>
            <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <Link
            href="/eod"
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
          >
            <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">End of Day Report</div>
              <div className="text-xs text-muted-foreground">
                Bagikan rekap harian ke WhatsApp.
              </div>
            </div>
            <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </div>
      )}

      <Link
        href="/matrix"
        className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
      >
        <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Grid3x3 className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Inventory Matrix</div>
          <div className="text-xs text-muted-foreground">
            Laporan harian stok awal, masuk, terjual, transfer, dan stok akhir.
          </div>
        </div>
        <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </div>
  );
}

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  cta,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-3xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        {cta}
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
