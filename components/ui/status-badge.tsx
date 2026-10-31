import type { ReactNode } from "react";
import { CheckIcon, ClockIcon, DashIcon, InfoIcon, LockIcon } from "./icons";

export type StatusTone = "success" | "pending" | "neutral" | "info" | "locked";

const tones: Record<StatusTone, string> = {
  success: "text-success",
  pending: "text-warning",
  neutral: "text-text-muted",
  info: "text-info",
  locked: "text-text-muted",
};

const icons: Record<StatusTone, (props: { className?: string }) => ReactNode> = {
  success: CheckIcon,
  pending: ClockIcon,
  neutral: DashIcon,
  info: InfoIcon,
  locked: LockIcon,
};

/** Status with an icon and words, never colour alone (SPEC §6, DESIGN §4.5). */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-pill border border-border px-2.5 py-0.5 text-small ${tones[tone]}`}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="text-text">{children}</span>
    </span>
  );
}
