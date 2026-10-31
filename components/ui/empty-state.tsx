import type { ReactNode } from "react";

/**
 * A designed empty state (DESIGN §4.5, §7.9): what this area is for, why it's empty, and what to
 * do next. Never a bare "No items yet."
 */
export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border-strong/60 px-5 py-6 sm:px-6">
      {icon ? <span className="text-text-muted">{icon}</span> : null}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-text">{title}</p>
        <div className="reading-width text-small text-text-secondary">{children}</div>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
