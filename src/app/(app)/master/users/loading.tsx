import { SkeletonTable } from "@/components/ui/skeleton";

export default function UsersLoading() {
  return (
    <div className="space-y-6">
      <SkeletonTable rows={5} cols={6} />
    </div>
  );
}
