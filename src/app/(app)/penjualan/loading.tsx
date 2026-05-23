import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function PenjualanLoading() {
  return (
    <div className="space-y-5">
      {/* Kartu produk */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
