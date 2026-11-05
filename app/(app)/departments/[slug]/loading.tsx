import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function DepartmentSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the department…" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-36" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    </div>
  );
}
