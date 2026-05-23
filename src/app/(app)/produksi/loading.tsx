import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonForm } from "@/components/ui/skeleton";

export default function ProduksiLoading() {
  return (
    <div className="space-y-6">
      {/* Tab navigasi */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      {/* Form produksi */}
      <SkeletonForm />
    </div>
  );
}
