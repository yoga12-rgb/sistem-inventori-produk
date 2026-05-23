import { SkeletonTable } from "@/components/ui/skeleton";

export default function CategoriesLoading() {
  return (
    <div className="space-y-6">
      <SkeletonTable rows={5} cols={7} />
    </div>
  );
}
