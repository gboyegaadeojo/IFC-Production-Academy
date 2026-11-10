import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function TrainingSkeleton() {
  return (
    <div className="page-container flex flex-col gap-5 py-5 sm:py-8" aria-busy="true">
      <LoadingStatus label="Loading your training…" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-56" />
        </div>
      </div>
    </div>
  );
}
