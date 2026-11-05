import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function TrainingSkeleton() {
  return (
    <div className="page-container flex flex-col gap-12 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your training…" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-6 w-[36rem] max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-80" />
        ))}
      </div>
    </div>
  );
}
