import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function ExploreSkeleton() {
  return (
    <div className="page-container flex flex-col gap-5 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading…" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 max-w-xl" />
      <Skeleton className="h-40 max-w-[40rem]" />
    </div>
  );
}
