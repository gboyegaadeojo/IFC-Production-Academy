import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function LibrarySkeleton() {
  return (
    <div className="page-container flex flex-col gap-4 py-6 lg:py-8" aria-busy="true">
      <LoadingStatus label="Loading the SOP library…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-9 max-w-2xl" />
      <Skeleton className="h-64" />
    </div>
  );
}
