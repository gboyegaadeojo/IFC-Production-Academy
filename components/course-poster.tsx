import type { CSSProperties } from "react";
import Link from "next/link";
import { DepartmentIcon } from "@/components/department-icon";
import { CheckIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseFacts, type LibraryCourse } from "@/lib/domain/library";

/**
 * A course as a poster (Course Hierarchy mock, approved 2026-11-04): its cover art, or the
 * category's colour and the title until there is one, with the small print underneath.
 */
export function CoursePoster({
  course,
  showCategory = false,
}: {
  course: LibraryCourse;
  showCategory?: boolean;
}) {
  const style = { "--dept": departmentHueVar(course.category.hue) } as CSSProperties;
  const facts = courseFacts(course);
  return (
    <Link
      href={course.href}
      prefetch={false}
      style={style}
      className="group flex flex-col gap-2 rounded-card"
    >
      <span className="relative block aspect-[3/4] overflow-hidden rounded-card border border-[color-mix(in_srgb,var(--dept)_35%,var(--border))] transition-[translate,box-shadow] duration-[var(--duration-base)] ease-standard group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-lift)] group-focus-visible:-translate-y-1 motion-reduce:translate-y-0!">
        {course.coverUrl ? (
          // Covers are public files with no image service on this plan, so a plain image is right.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full flex-col justify-between bg-[linear-gradient(165deg,color-mix(in_srgb,var(--dept)_30%,var(--surface)),color-mix(in_srgb,var(--dept)_7%,var(--surface)))] p-3.5 text-text">
            <span aria-hidden="true" className="text-[var(--dept)]">
              <DepartmentIcon icon={course.category.icon} className="size-5" />
            </span>
            <span aria-hidden="true" className="text-title font-bold text-balance break-words">
              {course.title}
            </span>
          </span>
        )}
      </span>
      <span className="flex flex-col gap-1">
        {/* The art carries the title for sighted people; this keeps it for everyone. */}
        <span className={course.coverUrl ? "font-medium text-text" : "sr-only"}>
          {course.title}
        </span>
        {showCategory ? (
          <span className="text-small font-medium text-[var(--dept)]">{course.category.name}</span>
        ) : null}
        {facts ? <span className="text-small text-text-muted">{facts}</span> : null}
        {course.state === "completed" ? (
          <span className="flex items-center gap-1 text-small font-medium text-success">
            <CheckIcon className="size-3.5" />
            Finished
          </span>
        ) : course.state !== "not_started" ? (
          <ProgressBar
            percent={course.percent}
            label={`${course.title}: ${course.percent}% done`}
          />
        ) : null}
      </span>
    </Link>
  );
}
