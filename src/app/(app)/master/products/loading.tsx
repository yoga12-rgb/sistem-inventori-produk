import { SkeletonTable } from "@/components/ui/skeleton";

export default function ProductsLoading() {
  return (
    <div className="space-y-6">
      <SkeletonTable rows={6} cols={10} />
    </div>
  );
}
