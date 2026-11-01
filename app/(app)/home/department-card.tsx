import type { CSSProperties } from "react";
import Link from "next/link";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DepartmentCard as DepartmentCardData } from "@/lib/data/departments";
import type { ContinueCourse } from "@/lib/data/progress";
import { formatDate } from "@/lib/domain/dates";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseCountLabel, levelProgressLabel, type DepartmentLearning } from "@/lib/domain/home";
import { stepHref } from "@/lib/domain/learning";
import { RequestMembershipButton } from "./request-membership-button";

/**
 * A department you belong to (approved mock, 2026-11-01): cover, name, Approved to Serve when it
 * applies, each level's lesson progress, and one next step. Approval comes from its own record and
 * is never inferred from lessons (SPEC §3, SRS-PROG-007).
 */
export function MemberDepartmentCard({
  department,
  learning,
  continuing,
  approvedRoles,
}: {
  department: DepartmentCardData;
  learning: DepartmentLearning | undefined;
  /** The most recently opened unfinished course here, if any. */
  continuing: ContinueCourse | undefined;
  approvedRoles: readonly string[];
}) {
  const headingId = `department-${department.id}`;
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;
  const published = learning?.publishedCourses ?? 0;
  const next = continuing?.progress.next ?? null;

  return (
    <article
      aria-labelledby={headingId}
      style={style}
      className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface"
    >
      <CompactCover icon={department.icon} />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h3 id={headingId} className="text-subheading font-semibold">
              <Link
                href={`/departments/${department.slug}`}
                className="rounded-button underline-offset-4 hover:underline"
              >
                {department.name}
              </Link>
            </h3>
            {department.since ? (
              <span className="text-small text-text-muted">
                Member since {formatDate(department.since)}
              </span>
            ) : null}
          </div>
          {approvedRoles.length > 0 ? (
            <StatusBadge tone="success">
              Approved: {approvedRoles[0]}
              {approvedRoles.length > 1 ? ` +${approvedRoles.length - 1}` : ""}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Member</StatusBadge>
          )}
        </div>

        {learning && learning.levels.length > 0 ? (
          <ol className="grid gap-2 sm:grid-cols-3">
            {learning.levels.map((level) => {
              const label = levelProgressLabel(level);
              return (
                <li
                  key={level.levelId}
                  className="flex flex-col gap-1.5 rounded-button border border-border bg-card px-3 py-2.5"
                >
                  <span className="eyebrow">Level {level.number}</span>
                  <span className="text-small font-medium text-text">{level.name}</span>
                  <ProgressBar
                    percent={
                      level.lessonsTotal ? (level.lessonsDone / level.lessonsTotal) * 100 : 0
                    }
                    label={`${department.name} level ${level.number}: ${label}`}
                  />
                  <span className="text-small text-text-muted">{label}</span>
                </li>
              );
            })}
          </ol>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-small text-text-muted">
            {next
              ? `Next: ${next.title}`
              : published > 0
                ? `${courseCountLabel(published)} published.`
                : "Courses are being prepared."}
          </p>
          {continuing && next ? (
            <Link
              href={stepHref(continuing.course.id, next)}
              className={buttonClasses("primary", "gap-2")}
            >
              Continue
              <span className="sr-only">
                {" "}
                {continuing.course.title}: {next.title}
              </span>
              <ArrowRightIcon className="size-4" />
            </Link>
          ) : (
            <Link
              href={`/departments/${department.slug}`}
              className={buttonClasses("secondary", "gap-2")}
            >
              Open department<span className="sr-only"> {department.name}</span>
              <ArrowRightIcon className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/** A short cover: the viewfinder grid with the department icon in its hue. Decorative. */
function CompactCover({ icon }: { icon: string }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-24 items-center justify-center overflow-hidden border-b border-border bg-surface"
    >
      <span className="absolute inset-y-0 left-1/3 w-px bg-border/60" />
      <span className="absolute inset-y-0 left-2/3 w-px bg-border/60" />
      <span className="absolute inset-x-0 top-1/2 h-px bg-border/60" />
      <span className="absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_50%,color-mix(in_srgb,var(--dept)_18%,transparent),transparent_70%)]" />
      <span className="relative text-[var(--dept)]">
        <DepartmentIcon icon={icon} className="size-8" />
      </span>
    </div>
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
      className="grid h-full grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:items-center"
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
