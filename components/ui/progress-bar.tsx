/**
 * A thin progress bar (DESIGN §4.4). The label is always given as text too, so the bar is never the
 * only signal. Fills with the department hue when one is set on a parent (--dept).
 */
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-2 overflow-hidden rounded-pill bg-hover"
    >
      <div
        className="h-full rounded-pill bg-[var(--dept,var(--accent))]"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
