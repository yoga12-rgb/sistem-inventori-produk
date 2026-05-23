import { SkeletonTable } from "@/components/ui/skeleton";

export default function AktivitasLoading() {
  return (
    <div className="space-y-6">
      <SkeletonTable rows={10} cols={7} />
    </div>
  );
}
