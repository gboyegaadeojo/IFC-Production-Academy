import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function MentoringSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading mentoring…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 max-w-3xl" />
    </div>
  );
}
