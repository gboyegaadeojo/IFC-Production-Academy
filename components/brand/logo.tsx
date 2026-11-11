import {
  LOGO_VIEWBOX,
  logoSize,
  MARK_PLACEMENT,
  markCut,
  markPixels,
  STACKED_OFFSETS,
  type LogoTone,
  type LogoVariant,
} from "@/lib/domain/brand-logo";
import {
  MARK_LINE_PATH,
  WORDMARK_ACADEMY_PATH,
  WORDMARK_NAME_PATH,
} from "@/lib/generated/brand-paths";

export type LogoProps = {
  variant?: LogoVariant;
  /** auto follows the theme; light and dark force one; mono is one colour, from currentColor. */
  tone?: LogoTone;
  /** Height in pixels. The width follows from the logo's proportions. */
  size?: number;
  /** The logo's accessible name, usually "IFC Production Academy". */
  label: string;
  /** For a repeat of a logo already named nearby: hidden from screen readers. */
  decorative?: boolean;
  className?: string;
};

/**
 * The Signal Line logo (decision 2026-11-10), drawn inline so it follows the theme: the line and
 * wordmark take currentColor, and the dot and "ACADEMY" take --logo-accent, the logo's only accent.
 * Explicit width and height, so the page never shifts as it loads. Pure: works on the server too.
 * For the app's own logo, which Admin, Branding can replace, use BrandLogo or BrandMark instead.
 */
export function Logo({
  variant = "horizontal",
  tone = "auto",
  size = 32,
  label,
  decorative = false,
  className = "",
}: LogoProps) {
  const box = LOGO_VIEWBOX[variant];
  const { width, height } = logoSize(variant, size);
  const accent = tone === "mono" ? "currentColor" : "var(--logo-accent)";
  const cut = markCut(markPixels(variant, size));
  const place = MARK_PLACEMENT[variant];
  const colour = tone === "mono" ? "" : "text-logo-ink";
  const toneClass = tone === "light" || tone === "dark" ? `logo-tone-${tone}` : "";

  const mark = (
    <svg x={place.x} y={place.y} width={place.width} height={place.height} viewBox="0 0 96 96">
      <path
        d={MARK_LINE_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={cut.strokeWidth}
        strokeLinecap="round"
      />
      <circle cx="82" cy="14" r={cut.dotRadius} fill={accent} />
    </svg>
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      width={width}
      height={height}
      focusable="false"
      data-logo={variant}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className={`shrink-0 ${toneClass} ${colour} ${className}`.trim()}
    >
      {mark}
      {variant === "horizontal" ? (
        <>
          <path fill="currentColor" d={WORDMARK_NAME_PATH} />
          <path fill={accent} d={WORDMARK_ACADEMY_PATH} />
        </>
      ) : null}
      {variant === "stacked" ? (
        <>
          <path
            fill="currentColor"
            d={WORDMARK_NAME_PATH}
            transform={`translate(${STACKED_OFFSETS.name.x} ${STACKED_OFFSETS.name.y})`}
          />
          <path
            fill={accent}
            d={WORDMARK_ACADEMY_PATH}
            transform={`translate(${STACKED_OFFSETS.academy.x} ${STACKED_OFFSETS.academy.y})`}
          />
        </>
      ) : null}
    </svg>
  );
}
