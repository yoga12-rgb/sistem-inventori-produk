import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function TransferLoading() {
  return (
    <div className="space-y-6">
      {/* Box tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
      {/* Table */}
      <SkeletonTable rows={8} cols={7} />
    </div>
  );
}
