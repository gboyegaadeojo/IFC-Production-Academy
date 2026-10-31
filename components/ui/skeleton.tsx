/** A loading block shaped like the content it stands in for (DESIGN §5, §7.9). */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-card bg-card motion-safe:animate-pulse ${className}`}
    />
  );
}

/** Announces loading once, for screen readers, alongside visual skeletons. */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}
