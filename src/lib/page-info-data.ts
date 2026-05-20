/**
 * Mapping route → metadata halaman (judul, ringkasan, fitur, shortcut, tips).
 * Dipakai oleh `<TopbarPageInfo>` di AppShell.
 *
 * Resolusi:
 *   - Cari entry yang exact-match `pathname`.
 *   - Kalau tidak ketemu, cari entry dengan `prefix` paling panjang yang
 *     cocok (untuk dynamic route mis. `/transfer/[id]`).
 *   - Kalau tetap tidak ketemu, fallback ke generic.
 */

export type PageFeature = { title: string; desc: string };
export type PageShortcut = { keys: string[]; desc: string };

export type PageInfoEntry = {
  /** Eyebrow di modal, mis. "Operasional". */
  eyebrow?: string;
  /** Judul halaman. */
  title: string;
  /** Ringkasan singkat 1-2 kalimat. */
  summary: string;
  features: PageFeature[];
  shortcuts?: PageShortcut[];
  tips?: string[];
};

/** Match by exact path. */
const EXACT: Record<string, PageInfoEntry> = {
  "/": {
    eyebrow: "Dashboard",
    title: "Dashboard",
    summary:
      "Ringkasan operasional & shortcut ke menu yang sering dipakai.",
    features: [
      {
        title: "Banner expired-soon",
        desc: "Jumlah batch perishable yang mendekati expired di outlet Anda. Klik untuk filter di Stok.",
      },
      {
        title: "Banner inbox transfer",
        desc: "Muncul untuk kasir saat ada transfer pending masuk — klik untuk konfirmasi/menolak.",
      },
      {
        title: "Stat cards",
        desc: "Hitungan cepat: batch aktif, outlet, produk, pengguna.",
      },
    ],
    tips: [
      "Setiap halaman punya ikon ⓘ di top bar untuk panduan cepat.",
    ],
  },

  "/stok": {
    eyebrow: "Operasional",
    title: "Stok",
    summary:
      "Ringkasan stok aktif per produk × lokasi. Update real-time saat batch berubah.",
    features: [
      {
        title: "Filter lokasi & kategori",
        desc: "Pilih outlet tunggal atau semua. Filter kategori opsional, persisten di browser.",
      },
      {
        title: "Detail batch",
        desc: "Klik tombol Detail batch untuk lihat per-batch (tgl produksi, expiry, sisa).",
      },
      {
        title: "Warning expired",
        desc: "Baris perishable ditandai oranye saat mendekati expired + saran diskon.",
      },
      {
        title: "Buang stok",
        desc: "Catat Expired / Compliment / Tester / Rusak. Default FIFO atau pilih batch.",
      },
      {
        title: "Realtime",
        desc: "Tabel sinkron otomatis saat ada produksi, transfer, atau penjualan.",
      },
    ],
    tips: [
      "Adjustment muncul otomatis saat transfer dibatalkan/ditolak.",
      "Filter lokasi tersimpan di browser per device.",
    ],
  },

  "/produksi": {
    eyebrow: "Operasional",
    title: "Produksi & Stok Masuk",
    summary:
      "Catat batch perishable di Central Pastry & pemasukan stok non-perishable.",
    features: [
      {
        title: "Catat produksi",
        desc: "Multi-varian per submission. Expiry terisi otomatis dari shelf life produk.",
      },
      {
        title: "Stok masuk (non-perishable)",
        desc: "Pemasukan kemasan/kardus ke lokasi mana pun, default Central Pastry.",
      },
      {
        title: "Riwayat produksi",
        desc: "Tabel batch per tanggal dengan filter lokasi, persisten di browser.",
      },
      {
        title: "Realtime",
        desc: "Tab Riwayat menerima update otomatis saat ada batch baru tercatat.",
      },
    ],
    tips: [
      "Tab disimpan di localStorage — tab terakhir terbuka saat halaman dibuka lagi.",
      "Riwayat hanya fetch saat tab Riwayat aktif (hemat bandwidth).",
    ],
  },

  "/transfer": {
    eyebrow: "Operasional",
    title: "Transfer",
    summary:
      "Pindahkan stok antar lokasi. Two-way perlu konfirmasi; one-way langsung jadi.",
    features: [
      {
        title: "Mode two-way",
        desc: "Pengirim membuat → penerima konfirmasi/menolak. Stok ditahan di transit.",
      },
      {
        title: "Mode one-way",
        desc: "Stok langsung pindah ke lokasi tujuan tanpa konfirmasi.",
      },
      {
        title: "Filter status & lokasi",
        desc: "Cari transfer cepat. Filter tersimpan di browser.",
      },
      {
        title: "Inheritance batch",
        desc: "Tanggal produksi & expiry dari batch sumber dibawa ke batch tujuan.",
      },
    ],
    tips: [
      "Kasir hanya bisa membuat transfer dari outletnya sendiri.",
      "Pembatalan/penolakan otomatis mengembalikan stok ke batch sumber sebagai adjustment.",
    ],
  },

  "/transfer/baru": {
    eyebrow: "Operasional",
    title: "Buat Transfer",
    summary:
      "Form multi-item untuk membuat transfer baru antar lokasi.",
    features: [
      {
        title: "Pilih batch sumber",
        desc: "Dropdown menampilkan info shelf life agar mudah pilih batch tertua dulu.",
      },
      {
        title: "Mode one-way / two-way",
        desc: "Two-way default — perlu konfirmasi penerima.",
      },
      {
        title: "Validasi qty",
        desc: "Qty di-cek client-side terhadap remaining_qty batch sumber.",
      },
    ],
  },

  "/penjualan": {
    eyebrow: "Operasional",
    title: "Penjualan",
    summary:
      "POS untuk mencatat transaksi multi-item. Stok dipotong otomatis FIFO.",
    features: [
      {
        title: "Tap kartu produk",
        desc: "Tap untuk +1 di keranjang. Tap berulang menambah qty.",
      },
      {
        title: "Filter cepat",
        desc: "Tab Perishable / Non-perishable / Hampir expired + chip kategori.",
      },
      {
        title: "Multi-batch split",
        desc: "Pilih FIFO otomatis atau tentukan qty per batch lewat dialog batch.",
      },
      {
        title: "Riwayat hari ini",
        desc: "Sheet kanan menampilkan transaksi; bisa pilih tanggal lain.",
      },
      {
        title: "Realtime stok",
        desc: "Kartu produk update otomatis saat batch berubah dari outlet ini.",
      },
    ],
    shortcuts: [
      { keys: ["/"], desc: "Fokus ke kolom pencarian" },
      { keys: ["Ctrl", "Enter"], desc: "Catat transaksi" },
    ],
    tips: [
      "Default FIFO mengambil batch tertua. Pilih batch manual hanya jika perlu override.",
      "Warning expired muncul di kartu produk dan baris keranjang.",
    ],
  },

  "/eod": {
    eyebrow: "Operasional",
    title: "End of Day Report",
    summary:
      "Ringkasan penjualan, disposal, dan stok akhir per outlet untuk dibagikan ke WhatsApp.",
    features: [
      {
        title: "Pratinjau lengkap",
        desc: "Section Terjual, Disposal (per kategori), dan Stock Update per batch.",
      },
      {
        title: "Bagikan ke WhatsApp",
        desc: "Tombol membuka wa.me — pilih kontak/grup tujuan secara manual.",
      },
      {
        title: "Salin teks",
        desc: "Cadangan jika scheme wa.me diblokir di perangkat.",
      },
      {
        title: "Filter outlet & tanggal",
        desc: "Tanggal disimpan di browser agar tidak perlu pilih ulang setiap buka.",
      },
    ],
    tips: [
      "Disposal dipisah per kategori (Expired, Compliment, Tester, Rusak) dengan emoji.",
      "Tanggal pada Stock Update = produced_at batch.",
    ],
  },

  "/matrix": {
    eyebrow: "Laporan",
    title: "Inventory Matrix",
    summary:
      "Stok awal, masuk, terjual, transfer, dan stok akhir per produk × lokasi untuk satu tanggal.",
    features: [
      {
        title: "Navigasi tanggal & lokasi",
        desc: "Tombol ◀/▶ untuk geser tanggal/lokasi cepat. Tombol Hari ini & Semua sebagai shortcut.",
      },
      {
        title: "Drilldown per sel",
        desc: "Klik angka untuk melihat detail movement individual.",
      },
      {
        title: "Kolom disposal",
        desc: "Expired, Compliment, Tester, Rusak ditampilkan terpisah.",
      },
      {
        title: "Filter persisten",
        desc: "Pilihan lokasi tersimpan di browser per device.",
      },
    ],
    tips: [
      "Stok akhir = Stok awal + Masuk + Transfer In − Transfer Out − Terjual − Disposal.",
      "Sel bernilai 0 ditampilkan sebagai dash agar fokus visual ke aktivitas nyata.",
    ],
  },

  "/aktivitas": {
    eyebrow: "Audit",
    title: "Aktivitas",
    summary:
      "200 movement stok terbaru sebagai audit trail.",
    features: [
      {
        title: "Filter via URL",
        desc: "Filter tipe & lokasi dengan query string ?type=...&outlet=...",
      },
      {
        title: "Lengkap dengan aktor",
        desc: "Setiap baris menampilkan siapa pengguna yang membuat movement.",
      },
      {
        title: "Reference bawaan",
        desc: "Sale, transfer, atau adjustment otomatis terkait dengan record asalnya.",
      },
    ],
    tips: [
      "Aktivitas hanya bisa diakses Super Admin.",
      "Adjustment muncul saat transfer dibatalkan/ditolak.",
    ],
  },

  "/master/outlets": {
    eyebrow: "Master Data",
    title: "Outlet",
    summary:
      "Daftar Central Pastry (sumber produksi) dan outlet (cabang). Hanya Super Admin yang bisa mengubah.",
    features: [
      {
        title: "Tipe lokasi",
        desc: "Central Pastry hanya satu — sisanya outlet (cabang).",
      },
      {
        title: "Kode unik",
        desc: "Mis. CK01, OUT-JKT. Tidak boleh duplikat.",
      },
      {
        title: "Soft delete",
        desc: "Toggle aktif/nonaktif tanpa menghapus histori.",
      },
    ],
  },

  "/master/categories": {
    eyebrow: "Master Data",
    title: "Kategori",
    summary:
      "Kelompokkan produk untuk filter cepat di Penjualan & Stok.",
    features: [
      {
        title: "Ikon & warna",
        desc: "Custom emoji + hex color untuk badge & chip filter.",
      },
      {
        title: "Urutan tampilan",
        desc: "Atur sort untuk menentukan urutan chip di POS.",
      },
      {
        title: "Soft delete",
        desc: "Nonaktifkan tanpa menghapus produk yang menggunakan.",
      },
    ],
    tips: [
      'Produk lama tanpa kategori akan masuk bucket "Tanpa kategori".',
    ],
  },

  "/master/products": {
    eyebrow: "Master Data",
    title: "Produk",
    summary:
      "Master varian produk. Tiap varian = produk independen dengan SKU sendiri.",
    features: [
      {
        title: "Perishable vs non-perishable",
        desc: "Toggle is_perishable mengaktifkan logika expiry & shelf life.",
      },
      {
        title: "Default shelf life",
        desc: "Jam ketahanan dipakai untuk auto-fill expiry batch baru.",
      },
      {
        title: "Threshold warning & saran diskon",
        desc: "Konfigurasi per varian — UI menyala saat batch mendekati expired.",
      },
      {
        title: "Kategori opsional",
        desc: "Assign kategori untuk filter cepat di POS & Stok.",
      },
    ],
  },

  "/master/users": {
    eyebrow: "Master Data",
    title: "Pengguna",
    summary:
      "Buat akun login Supabase + profil sekaligus. Kasir wajib ditugaskan ke satu outlet.",
    features: [
      {
        title: "Buat akun",
        desc: "Email + password sementara — kasir bisa login langsung.",
      },
      {
        title: "Reset password",
        desc: "Setel password baru tanpa email reset link, cocok untuk hand-over.",
      },
      {
        title: "Assign outlet",
        desc: "Kasir terkunci ke satu outlet untuk pencatatan penjualan & transfer.",
      },
      {
        title: "Soft delete",
        desc: "Nonaktifkan profil tanpa menghapus auth user.",
      },
    ],
  },
};

/** Match by prefix (untuk dynamic routes). Urut dari paling spesifik. */
const PREFIX: Array<{ prefix: string; entry: PageInfoEntry }> = [
  {
    prefix: "/transfer/",
    entry: {
      eyebrow: "Operasional",
      title: "Detail Transfer",
      summary:
        "Detail transfer + tombol aksi (Ship / Confirm / Reject / Cancel) sesuai peran.",
      features: [
        {
          title: "Status & timeline",
          desc: "pending → in_transit → received | rejected | cancelled.",
        },
        {
          title: "Item lengkap",
          desc: "Daftar batch sumber + tujuan dengan qty masing-masing.",
        },
      ],
    },
  },
];

const FALLBACK: PageInfoEntry = {
  title: "Sistem Inventaris",
  summary: "Aplikasi manajemen inventaris multi-outlet.",
  features: [],
};

export function resolvePageInfo(pathname: string): PageInfoEntry {
  if (EXACT[pathname]) return EXACT[pathname];
  // Cari prefix paling panjang.
  let best: PageInfoEntry | null = null;
  let bestLen = 0;
  for (const { prefix, entry } of PREFIX) {
    if (pathname.startsWith(prefix) && prefix.length > bestLen) {
      best = entry;
      bestLen = prefix.length;
    }
  }
  return best ?? FALLBACK;
}
