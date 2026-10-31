import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";

/**
 * One clear title per page (DESIGN §3.3), with optional breadcrumbs, a short description, and
 * page-level actions. Keep the description to one or two lines.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  id,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <header className="flex flex-col gap-3">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 id={id} className="text-title font-semibold">
            {title}
          </h1>
          {description ? (
            <div className="reading-width text-text-secondary">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
