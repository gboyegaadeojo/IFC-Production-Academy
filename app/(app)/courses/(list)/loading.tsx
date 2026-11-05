import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function LibrarySkeleton() {
  return (
    <div className="page-container flex flex-col gap-6 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the courses…" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 max-w-xl" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="aspect-[3/4]" />
        ))}
      </div>
    </div>
  );
}
