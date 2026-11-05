import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function ScheduleSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your schedule…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 max-w-3xl" />
    </div>
  );
}
