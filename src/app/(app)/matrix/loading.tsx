import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function MatrixLoading() {
  return (
    <div className="space-y-6">
      {/* Navigation controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
      {/* Matrix table */}
      <SkeletonTable rows={10} cols={8} />
    </div>
  );
}
