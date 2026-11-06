import type { CSSProperties } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DepartmentCard as DepartmentCardData } from "@/lib/data/departments";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  courseCountLabel,
  departmentProgress,
  departmentProgressLabel,
  type DepartmentLearning,
} from "@/lib/domain/home";
import { RequestMembershipButton } from "./request-membership-button";

/**
 * A department you belong to, as a tile in a row that scrolls sideways (mock 5, approved
 * 2026-11-06): its colour and name, then a bar of lessons complete with the same count in words.
 * The whole tile opens the department. Approval comes from its own record and is never inferred
 * from lessons (SPEC §3, SRS-PROG-007).
 */
export function DepartmentTile({
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
  const { done, total, percent } = departmentProgress(learning?.levels ?? []);

  return (
    <article
      aria-labelledby={headingId}
      style={style}
      className="group relative flex w-60 shrink-0 snap-start flex-col gap-2"
    >
      <div className="flex h-32 flex-col justify-between rounded-card bg-[color-mix(in_srgb,var(--dept)_55%,var(--photo-bg))] p-3.5 text-on-accent transition-[translate] duration-[var(--duration-base)] ease-standard group-hover:-translate-y-0.5 motion-reduce:translate-y-0!">
        <span className="text-small font-medium opacity-85">
          {published > 0 ? courseCountLabel(published) : "Courses coming soon"}
        </span>
        <h3 id={headingId} className="text-subheading leading-tight font-bold">
          <Link
            href={`/departments/${department.slug}`}
            className="rounded-button after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
          >
            {department.name}
          </Link>
        </h3>
      </div>
      {total > 0 ? (
        <ProgressBar percent={percent} label={`${department.name}: lessons complete`} />
      ) : null}
      <p className="text-small text-text-muted">
        {total > 0 ? `${percent}% · ` : ""}
        {departmentProgressLabel(published, done, total)}
      </p>
      {approvedRoles.length > 0 ? (
        <StatusBadge tone="success">
          Approved: {approvedRoles[0]}
          {approvedRoles.length > 1 ? ` +${approvedRoles.length - 1}` : ""}
        </StatusBadge>
      ) : null}
    </article>
  );
}

/**
 * A department you haven't joined: its name, what it's for, and its one next step. Every membership
 * state stays distinct: requested, can request (first time, after a decline, after removal), can
 * join, coming soon, invite only. Inactive departments never reach here.
 */
export function ExploreRow({ department }: { department: DepartmentCardData }) {
  const headingId = `department-${department.id}`;
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-1.5 py-2">
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
        <p className="line-clamp-2 text-small text-text-muted">{department.summary}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
    case "can_join":
      return (
        <RequestMembershipButton
          departmentId={department.id}
          departmentName={department.name}
          again={false}
          join
        />
      );
    case "topic":
    case "unavailable":
      return null;
  }
}
