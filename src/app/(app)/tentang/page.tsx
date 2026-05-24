import {
  Boxes,
  ClipboardCheck,
  ExternalLink,
  HeartHandshake,
  ShieldCheck,
  Target,
  Workflow,
} from "lucide-react";

export const metadata = { title: "Tentang Aplikasi - Sistem Inventaris" };

const goals = [
  {
    icon: Boxes,
    title: "Stok lebih mudah dipantau",
    desc: "Menyatukan stok dari produksi, transfer, penjualan, dan disposal agar kondisi tiap lokasi lebih jelas.",
  },
  {
    icon: Workflow,
    title: "Alur kerja lebih rapi",
    desc: "Membantu pencatatan batch, FEFO, perpindahan stok, dan riwayat transaksi tanpa mengandalkan catatan terpisah.",
  },
  {
    icon: ShieldCheck,
    title: "Data lebih bisa diaudit",
    desc: "Setiap pergerakan stok tersimpan sebagai aktivitas sehingga perubahan penting bisa ditelusuri kembali.",
  },
];

const scopes = [
  "Produksi batch dan stok masuk",
  "Monitoring stok multi-lokasi",
  "Transfer antar lokasi",
  "Penjualan dengan pemotongan FEFO",
  "Pencatatan expired, tester, compliment, dan rusak",
  "Laporan harian dan audit aktivitas",
];

export default function TentangPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Sistem Inventaris Produk
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Dibuat untuk membantu operasional stok harian tetap tertata.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Aplikasi ini dibuat untuk mengurangi pencatatan manual yang rawan
              tercecer, memperjelas posisi stok antar lokasi, dan menjaga alur
              produk perishable tetap mengikuti prinsip FEFO.
            </p>
          </div>

          <a
            href="https://www.instagram.com/mang.agooy/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            Yoga Septriana
          </a>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {goals.map((goal) => (
          <article key={goal.title} className="rounded-xl border bg-card p-4">
            <goal.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">{goal.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {goal.desc}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="inline-flex items-center gap-2 text-base font-semibold">
            <Target className="h-5 w-5 text-primary" />
            Tujuan pembuatan
          </h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Tujuan utama aplikasi ini adalah membuat stok operasional lebih
            transparan dari awal sampai akhir: produk dibuat, masuk ke lokasi,
            berpindah, dijual, atau dibuang dengan alasan yang jelas. Dengan
            data yang rapi, keputusan harian seperti produksi ulang, transfer,
            dan evaluasi produk expired bisa dilakukan lebih cepat.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="inline-flex items-center gap-2 text-base font-semibold">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Cakupan fitur
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {scopes.map((scope) => (
              <li key={scope} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                <span>{scope}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="inline-flex items-center gap-2 text-base font-semibold">
          <HeartHandshake className="h-5 w-5 text-primary" />
          Kredit
        </h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Aplikasi ini dibuat untuk mendukung kebutuhan operasional inventaris.
          Developer:{" "}
          <a
            href="https://www.instagram.com/mang.agooy/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Yoga Septriana
          </a>
          .
        </p>
      </section>
    </div>
  );
}
