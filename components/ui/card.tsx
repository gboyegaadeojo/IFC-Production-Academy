import type { HTMLAttributes, ReactNode } from "react";

/** A bordered surface for grouped content. Prefer rows and dividers for lists (DESIGN §4.3). */
export function Card({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`rounded-card border border-border bg-card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
