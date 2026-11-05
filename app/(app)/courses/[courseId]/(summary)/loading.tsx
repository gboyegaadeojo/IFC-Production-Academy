import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function CourseSkeleton() {
  return (
    <div className="page-container flex flex-col gap-10 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the course…" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-96 max-w-full" />
          <Skeleton className="h-6 w-[32rem] max-w-full" />
          <Skeleton className="mt-6 h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
