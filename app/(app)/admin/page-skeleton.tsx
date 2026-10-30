export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="h-16 max-w-xl rounded-card bg-card motion-safe:animate-pulse" />
      <div className="h-48 rounded-card bg-card motion-safe:animate-pulse" />
      <div className="h-48 rounded-card bg-card motion-safe:animate-pulse" />
    </div>
  );
}
