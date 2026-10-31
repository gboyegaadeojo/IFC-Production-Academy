import type { CSSProperties } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { DepartmentCover } from "@/components/department-cover";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DepartmentCard as DepartmentCardData } from "@/lib/data/departments";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseCountLabel } from "@/lib/domain/home";
import { RequestMembershipButton } from "./request-membership-button";

/**
 * Department card (DESIGN §6.2): cover, name, one value line, status, and exactly one next step.
 * Every membership state stays distinct: member, requested, can request (first time, after a
 * decline, after removal), coming soon, invite only. Inactive departments never reach here.
 */
export function DepartmentCard({
  department,
  publishedCourses,
}: {
  department: DepartmentCardData;
  /** Published courses, known only for departments the person belongs to. */
  publishedCourses: number | null;
}) {
  const headingId = `department-${department.id}`;
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;

  return (
    <article
      aria-labelledby={headingId}
      style={style}
      className="group flex w-full flex-col overflow-hidden rounded-card border border-border bg-card transition-surface hover:border-border-strong/70"
    >
      {/* The hue rail: identity colour as a minor accent (DESIGN §4.1). */}
      <span aria-hidden="true" className="h-0.5 bg-[var(--dept)]" />
      <DepartmentCover
        hue={department.hue}
        icon={department.icon}
        label={department.name}
        className="border-b border-border"
      />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 id={headingId} className="text-subheading font-semibold">
          {/* Department pages are browsable before joining (SRS-MEM-006). */}
          <Link
            href={`/departments/${department.slug}`}
            className="rounded-button underline-offset-4 hover:underline"
          >
            {department.name}
          </Link>
        </h3>
        <p className="text-small text-text-secondary">{department.summary}</p>
        <div className="mt-auto flex flex-col gap-2 pt-3">
          <MembershipStatus department={department} publishedCourses={publishedCourses} />
        </div>
      </div>
    </article>
  );
}

/** Membership status and the one next step, shared by the card and the department page. */
export function MembershipStatus({
  department,
  publishedCourses,
  hideOpenLink = false,
}: {
  department: DepartmentCardData;
  publishedCourses: number | null;
  /** On the department page itself, there's nowhere to open. */
  hideOpenLink?: boolean;
}) {
  const { state } = department;
  switch (state.kind) {
    case "member":
      return (
        <>
          <StatusBadge tone="success">You&apos;re a member</StatusBadge>
          {/* The department page shows its own course count in the header. */}
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
          <p className="text-small text-text-muted">
            A department leader will review it
            {department.since ? ` · asked ${formatDateTime(department.since)}` : ""}.
          </p>
        </>
      );
    case "coming_soon":
      return (
        <>
          <StatusBadge tone="info">Coming soon</StatusBadge>
          <p className="text-small text-text-muted">Training opens when the curriculum is ready.</p>
        </>
      );
    case "invite_only":
      return (
        <>
          <StatusBadge tone="locked">By invitation</StatusBadge>
          <p className="text-small text-text-muted">Ask the department leader for an invite.</p>
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
