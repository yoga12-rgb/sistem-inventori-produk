import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function EodLoading() {
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-48 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
      <Skeleton className="h-5 w-64" />
      {/* Report cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard />
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
