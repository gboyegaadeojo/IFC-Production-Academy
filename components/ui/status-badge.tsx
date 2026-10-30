import type { ReactNode } from "react";

export type StatusTone = "success" | "pending" | "neutral" | "info";

const tones: Record<StatusTone, string> = {
  success: "text-success",
  pending: "text-warning",
  neutral: "text-text-secondary",
  info: "text-info",
};

const icons: Record<StatusTone, ReactNode> = {
  success: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  pending: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  neutral: <path d="M6 12h12" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
};

/** Status with an icon and words, never colour alone (SPEC §6). */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1 text-small font-medium ${tones[tone]}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icons[tone]}
      </svg>
      <span className="text-text">{children}</span>
    </span>
  );
}
