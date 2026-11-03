import Link from "next/link";
import type { CSSProperties } from "react";
import { departmentHueVar } from "@/lib/domain/departments";

/** Choose one department. Applies straight away (app review, item 17). */
export function DepartmentChips({
  departments,
  currentId,
  hrefFor,
}: {
  departments: readonly { id: string; name: string; hue: string }[];
  currentId: string | undefined;
  hrefFor: (departmentId: string) => string;
}) {
  return (
    <nav aria-label="Departments" className="flex flex-wrap gap-2">
      {departments.map((department) => {
        const current = department.id === currentId;
        return (
          <Link
            key={department.id}
            href={hrefFor(department.id)}
            aria-current={current ? "true" : undefined}
            style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
            className={`inline-flex min-h-control items-center gap-2 rounded-pill border px-3 text-small transition-surface ${
              current
                ? "border-accent-light bg-hover font-medium text-text"
                : "border-border text-text-secondary hover:border-border-strong hover:text-text"
            }`}
          >
            <span aria-hidden="true" className="size-2 rounded-pill bg-[var(--dept)]" />
            {department.name}
          </Link>
        );
      })}
    </nav>
  );
}
