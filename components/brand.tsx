// IFC's pillars-and-dove mark beside a "Production Academy" wordmark: an IFC ministry tool, not a
// separate brand (decision 4, docs/decisions/2026-10-31-open-decisions.md). The mark is IFC's own
// artwork from ifcwpg.com; swap in the SVG when IFC's communications team supplies one.

const MARK_ASPECT = 480 / 269;

/** The IFC mark alone. White for dark surfaces, black for paper. */
export function IfcMark({
  tone = "white",
  height = 22,
  className,
}: {
  tone?: "white" | "black";
  height?: number;
  className?: string;
}) {
  return (
    // A small fixed-size logo; next/image's optimiser isn't available on Workers.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/ifc-mark-${tone}.png`}
      alt="IFC"
      width={Math.round(height * MARK_ASPECT)}
      height={height}
      className={className}
    />
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <IfcMark className="mark-on-theme" />{" "}
      <span className="text-body font-medium tracking-tight text-text">
        Production <span className="text-text-secondary">Academy</span>
      </span>
    </span>
  );
}
