import type { ReactNode } from "react";
import { CheckIcon, ClockIcon, InfoIcon, LockIcon } from "./icons";

export type StatusTone = "success" | "pending" | "neutral" | "info" | "locked";

// Soft fills for done and waiting (approved new look, 2026-11-01); the label stays in --text.
const tones: Record<StatusTone, string> = {
  success: "border-success-line bg-success-soft text-success",
  pending: "border-warning-line bg-warning-soft text-warning",
  neutral: "border-border bg-surface text-text-muted",
  info: "border-border bg-surface text-info",
  locked: "border-border bg-surface text-text-muted",
};

const icons: Partial<Record<StatusTone, (props: { className?: string }) => ReactNode>> = {
  success: CheckIcon,
  pending: ClockIcon,
  info: InfoIcon,
  locked: LockIcon,
};

/** Status in words, usually with an icon, never colour alone (SPEC §6, DESIGN §4.5). */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-small ${tones[tone]}`}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="text-text">{children}</span>
    </span>
  );
}
