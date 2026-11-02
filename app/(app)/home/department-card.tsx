import type { CSSProperties } from "react";
import Link from "next/link";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon, ChevronRightIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DepartmentCard as DepartmentCardData } from "@/lib/data/departments";
import type { ContinueCourse } from "@/lib/data/progress";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseCountLabel, type DepartmentLearning } from "@/lib/domain/home";
import { stepHref } from "@/lib/domain/learning";
import { RequestMembershipButton } from "./request-membership-button";

/**
 * A department you belong to (Training mock, approved 2026-11-02): one compact card with its icon,
 * what's there, your lessons done, and a thin bar per level. The whole card opens the department,
 * with the Lift hover. Approval comes from its own record and is never inferred from lessons
 * (SPEC §3, SRS-PROG-007).
 */
export function MemberDepartmentCard({
  department,
  learning,
  approvedRoles,
}: {
  department: DepartmentCardData;
  learning: DepartmentLearning | undefined;
  approvedRoles: readonly string[];
}) {
  const headingId = `department-${department.id}`;
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;
  const published = learning?.publishedCourses ?? 0;
  const levels = learning?.levels ?? [];
  const total = levels.reduce((n, level) => n + level.lessonsTotal, 0);
  const done = levels.reduce((n, level) => n + level.lessonsDone, 0);

  return (
    <article
      aria-labelledby={headingId}
      style={style}
      className="group relative flex h-full lift items-center gap-4 rounded-[14px] border border-border bg-card p-3 focus-within:bg-surface focus-within:shadow-[var(--shadow-lift)] sm:p-4"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[color-mix(in_srgb,var(--dept)_12%,var(--surface))] text-[var(--dept)] sm:size-11"
      >
        <DepartmentIcon icon={department.icon} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 id={headingId} className="font-semibold">
          <Link
            href={`/departments/${department.slug}`}
            className="rounded-button transition-surface group-hover:text-accent-light after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none"
          >
            {department.name}
          </Link>
        </h3>
        <p className="flex flex-wrap gap-x-1.5 text-small text-text-muted">
          {published > 0 ? (
            <>
              <span>{courseCountLabel(published)} ·</span>
              <span>
                {done} of {total} {total === 1 ? "lesson" : "lessons"}
              </span>
            </>
          ) : (
            <span>Courses coming soon</span>
          )}
        </p>
        {levels.length > 0 ? (
          <span aria-hidden="true" className="mt-1.5 flex gap-1">
            {levels.map((level) => (
              <span
                key={level.levelId}
                className={`h-1 max-w-14 flex-1 rounded-pill ${
                  level.lessonsDone > 0
                    ? "bg-[var(--dept)]"
                    : level.publishedCourses > 0
                      ? "bg-[color-mix(in_srgb,var(--dept)_45%,var(--border))]"
                      : "bg-border"
                }`}
              />
            ))}
          </span>
        ) : null}
      </div>
      {approvedRoles.length > 0 ? (
        <StatusBadge tone="success">
          Approved: {approvedRoles[0]}
          {approvedRoles.length > 1 ? ` +${approvedRoles.length - 1}` : ""}
        </StatusBadge>
      ) : null}
      <ChevronRightIcon className="size-4 shrink-0 text-text-muted transition-surface group-hover:translate-x-1 group-hover:text-accent-light" />
    </article>
  );
}

/**
 * A department you haven't joined, in "Other departments": icon, name, value line, and its one
 * next step. Every membership state stays distinct: requested, can request (first time, after a
 * decline, after removal), coming soon, invite only. Inactive departments never reach here.
 */
export function ExploreRow({
  department,
  continuing,
}: {
  department: DepartmentCardData;
  /** A course they've started here: training is open to everyone, members or not. */
  continuing?: ContinueCourse;
}) {
  const next = continuing?.progress.next ?? null;
  const headingId = `department-${department.id}`;
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;
  return (
    <article
      aria-labelledby={headingId}
      style={style}
      className="grid h-full grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 rounded-[14px] border border-dashed border-border-strong/50 p-4 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:items-center"
    >
      <span className="flex size-11 items-center justify-center rounded-button border border-border bg-card text-[var(--dept)]">
        <DepartmentIcon icon={department.icon} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 id={headingId} className="font-semibold">
          {/* Department pages are browsable before joining (SRS-MEM-006). */}
          <Link
            href={`/departments/${department.slug}`}
            className="rounded-button underline-offset-4 hover:underline"
          >
            {department.name}
          </Link>
        </h3>
        <p className="text-small text-text-secondary">{department.summary}</p>
        {continuing && next ? (
          <Link
            href={stepHref(continuing.course.id, next)}
            className="mt-1 w-fit text-small font-medium text-accent-light underline-offset-4 hover:underline"
          >
            Continue {continuing.course.title}: {next.title}
          </Link>
        ) : null}
      </div>
      <div className="col-start-2 flex flex-col gap-1.5 sm:col-start-3 sm:items-end">
        {/* Anyone can take a department's courses; joining is for serving with its team. */}
        {department.state.kind !== "coming_soon" ? (
          <Link
            href={`/departments/${department.slug}`}
            className={buttonClasses("secondary", "gap-1.5", "sm")}
          >
            See courses<span className="sr-only"> in {department.name}</span>
            <ArrowRightIcon className="size-3.5" />
          </Link>
        ) : null}
        <MembershipStatus department={department} publishedCourses={null} hideOpenLink compact />
      </div>
    </article>
  );
}

/** Membership status and the one next step, shared by the Training page and the department page. */
export function MembershipStatus({
  department,
  publishedCourses,
  hideOpenLink = false,
  compact = false,
}: {
  department: DepartmentCardData;
  publishedCourses: number | null;
  /** On the department page itself, there's nowhere to open. */
  hideOpenLink?: boolean;
  /** In a row: just the status or button, without the explanation. */
  compact?: boolean;
}) {
  const { state } = department;
  switch (state.kind) {
    case "member":
      return (
        <>
          <StatusBadge tone="success">You&apos;re a member</StatusBadge>
          {hideOpenLink ? null : (
            <p className="text-small text-text-muted">
              {publishedCourses
                ? `${courseCountLabel(publishedCourses)} published.`
                : "Courses are being prepared. They'll appear here when they're published."}
            </p>
          )}
          {hideOpenLink ? null : (
            <Link
              href={`/departments/${department.slug}`}
              className={buttonClasses("secondary", "self-start")}
            >
              Open department<span className="sr-only"> {department.name}</span>
              <ArrowRightIcon className="size-4" />
            </Link>
          )}
        </>
      );
    case "requested":
      return (
        <>
          <StatusBadge tone="pending">Request sent</StatusBadge>
          {compact ? null : (
            <p className="text-small text-text-muted">
              A department leader will review it
              {department.since ? ` · asked ${formatDateTime(department.since)}` : ""}.
            </p>
          )}
        </>
      );
    case "coming_soon":
      return (
        <>
          <StatusBadge tone="info">Coming soon</StatusBadge>
          {compact ? null : (
            <p className="text-small text-text-muted">
              Training opens when the curriculum is ready.
            </p>
          )}
        </>
      );
    case "invite_only":
      return (
        <>
          <StatusBadge tone="locked">By invitation</StatusBadge>
          {compact ? null : (
            <p className="text-small text-text-muted">Ask the department leader for an invite.</p>
          )}
        </>
      );
    case "can_request":
      return (
        <>
          {state.previously === "declined" ? (
            <p className="text-small text-text-muted">
              Your last request wasn&apos;t accepted. You can ask again.
            </p>
          ) : null}
          {state.previously === "removed" ? (
            <p className="text-small text-text-muted">You can ask to rejoin this department.</p>
          ) : null}
          <RequestMembershipButton
            departmentId={department.id}
            departmentName={department.name}
            again={state.previously !== null}
          />
        </>
      );
    case "unavailable":
      return null;
  }
}
