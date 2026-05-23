import { SkeletonTable } from "@/components/ui/skeleton";

export default function StokLoading() {
  return (
    <div className="space-y-6">
      {/*
       * StockBoard memiliki filter lokasi, kategori, dan tombol aksi,
       * lalu tabel stok di bawahnya.
       */}
      <div className="flex items-center justify-between gap-2">
        <SkeletonTable cols={3} rows={1} />
      </div>
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
}
