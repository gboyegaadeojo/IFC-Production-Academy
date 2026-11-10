import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function CourseSkeleton() {
  return (
    <div className="page-container flex flex-col gap-5 py-4 sm:py-6 xl:pb-12" aria-busy="true">
      <LoadingStatus label="Loading the course…" />
      <Skeleton className="h-8 w-24" />
      <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-12 xl:border-b xl:border-border xl:pb-14">
        <Skeleton className="aspect-[3/4]" />
        <div className="flex flex-col justify-center gap-3">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-10 w-96 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_26.25rem] xl:gap-12">
        <Skeleton className="h-96 xl:col-start-2 xl:row-start-1 xl:-mt-26" />
        <Skeleton className="h-64 xl:col-start-1 xl:row-start-1" />
      </div>
    </div>
  );
}
