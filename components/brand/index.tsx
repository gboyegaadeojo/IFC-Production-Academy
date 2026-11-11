"use client";

// The app's own logo: Signal Line by default (decision 2026-11-10), or what Admin, Branding chose
// (ADD-DASH-04), which always wins. The drawing itself is <Logo> in ./logo.

import { useBrand } from "@/components/brand-context";
import { usesBuiltInLogo, wordmarkParts } from "@/lib/domain/branding";
import { Logo } from "./logo";

export { Logo } from "./logo";

/**
 * The mark alone, for tight spaces: the folded side bar, the phone's top bar, the admin side bar,
 * the wall TV. An uploaded logo replaces it; a new name alone keeps the mark.
 */
export function BrandMark({
  size = 24,
  decorative = false,
  className = "",
}: {
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const { name, iconUrl } = useBrand();
  if (iconUrl) {
    return (
      // A small fixed-size logo; next/image's optimiser isn't available on Workers.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt={decorative ? "" : name}
        width={size}
        height={size}
        className={`shrink-0 rounded-button ${className}`}
      />
    );
  }
  return (
    <Logo variant="mark" size={size} label={name} decorative={decorative} className={className} />
  );
}

/**
 * The full logo, for places with room for it (52px and up: sign-in). With a logo or name chosen
 * in Admin, Branding, that logo and name show instead, since the wordmark spells the default name.
 */
export function BrandLogo({
  variant = "horizontal",
  size = 52,
  className = "",
}: {
  variant?: "horizontal" | "stacked";
  size?: number;
  className?: string;
}) {
  const brand = useBrand();
  if (usesBuiltInLogo(brand)) {
    return <Logo variant={variant} size={size} label={brand.name} className={className} />;
  }
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <BrandMark size={Math.round(size * 0.75)} decorative />
      <span className="text-heading font-semibold tracking-tight text-text">{brand.name}</span>
    </span>
  );
}

/**
 * The mark with the name in readable type, for slim headers on public pages (help, invites,
 * certificate checks). The logo's own "ACADEMY" would be too small to read there.
 */
export function Wordmark() {
  const { name } = useBrand();
  const { lead, soft } = wordmarkParts(name);
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <BrandMark size={26} decorative />
      <span className="text-body font-semibold tracking-tight text-text">
        {lead} <span className="text-text-secondary">{soft}</span>
      </span>
    </span>
  );
}
