import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Suspense fallback untuk Dashboard.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <header>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-8 w-64" />
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}
