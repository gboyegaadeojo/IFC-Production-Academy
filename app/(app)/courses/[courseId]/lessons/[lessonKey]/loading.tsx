import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function LessonSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the lesson…" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-96 max-w-full" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="hidden h-80 lg:block" />
      </div>
    </div>
  );
}
