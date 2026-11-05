import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** Shows the moment the link is clicked, before the server answers. */
export default function ProfileSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your profile…" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
        <Skeleton className="h-80" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-64" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </div>
  );
}
