"use client";

// IFC's pillars-and-dove mark beside a "Production Academy" wordmark: an IFC ministry tool, not a
// separate brand (decision 4, docs/decisions/2026-10-31-open-decisions.md). The mark is IFC's own
// artwork from ifcwpg.com; swap in the SVG when IFC's communications team supplies one.

import { useBrand } from "@/components/brand-context";
import { wordmarkParts } from "@/lib/domain/branding";

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

/** The chosen logo if there is one (ADD-DASH-04), otherwise the IFC mark. */
export function BrandMark({ height = 22, className }: { height?: number; className?: string }) {
  const { iconUrl } = useBrand();
  if (iconUrl) {
    return (
      // Same as above: a small fixed-size logo.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        width={height}
        height={height}
        className={`rounded-button ${className ?? ""}`}
      />
    );
  }
  return <IfcMark height={height} className={`mark-on-theme ${className ?? ""}`} />;
}

export function Wordmark() {
  const { name } = useBrand();
  const { lead, soft } = wordmarkParts(name);
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <BrandMark />{" "}
      <span className="text-body font-semibold tracking-tight text-text">
        {lead} <span className="text-text-secondary">{soft}</span>
      </span>
    </span>
  );
}
