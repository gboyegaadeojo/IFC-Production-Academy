import type { CSSProperties } from "react";
import Link from "next/link";
import { DepartmentIcon } from "@/components/department-icon";
import { ArrowRightIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ContinueCourse } from "@/lib/data/progress";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseProgressLabel } from "@/lib/domain/progress";

/**
 * "Continue learning" (DESIGN §6.1): real progress only, so it's absent until the learner has
 * opened a lesson. Each card goes straight to the next lesson that isn't complete.
 */
export function ContinueLearning({ courses }: { courses: ContinueCourse[] }) {
  return (
    <section aria-labelledby="continue-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Pick up where you left off</p>
        <h2 id="continue-heading" className="text-heading font-semibold">
          Continue learning
        </h2>
      </div>
      <ul className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {courses.map(({ course, progress, hasRequired }) => {
          const label = courseProgressLabel(progress, hasRequired);
          return (
            <li
              key={course.id}
              style={{ "--dept": departmentHueVar(course.department.hue) } as CSSProperties}
              className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-[var(--dept)]">
                  <DepartmentIcon icon={course.department.icon} className="size-5" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-small text-text-muted">
                    {course.department.name} · Level {course.level.number}
                  </p>
                  <h3 className="font-semibold text-balance">{course.title}</h3>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <ProgressBar percent={progress.percent} label={`${course.title} progress`} />
                <p className="text-small text-text-secondary">{label}</p>
              </div>
              {progress.next ? (
                <Link
                  href={`/courses/${course.id}/lessons/${progress.next.key}`}
                  className="mt-auto flex min-h-touch items-center justify-between gap-3 rounded-button text-small font-medium text-accent-light underline-offset-4 hover:underline lg:min-h-control"
                >
                  <span className="truncate">
                    <span className="sr-only">Continue {course.title}: </span>
                    Next: {progress.next.title}
                  </span>
                  <ArrowRightIcon className="size-4 shrink-0" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
