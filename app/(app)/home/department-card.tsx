import type { CSSProperties } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DepartmentCard as DepartmentCardData } from "@/lib/data/departments";
import { departmentHueVar } from "@/lib/domain/departments";
import { RequestMembershipButton } from "./request-membership-button";

export function DepartmentCard({ department }: { department: DepartmentCardData }) {
  const headingId = `department-${department.id}`;
  // The department hue only tints the cover strip and icon (SPEC §7).
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;

  return (
    <article
      aria-labelledby={headingId}
      style={style}
      className="flex w-full flex-col overflow-hidden rounded-card border border-border bg-card"
    >
      <div
        aria-hidden="true"
        className="h-20 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--dept)_30%,transparent),transparent_75%)]"
      />
      <div className="-mt-7 flex flex-1 flex-col gap-3 px-6 pb-6">
        <span className="flex size-14 items-center justify-center rounded-card border border-[var(--dept)] bg-surface text-[var(--dept)]">
          <DepartmentIcon icon={department.icon} className="size-7" />
        </span>
        <h3 id={headingId} className="text-subheading font-semibold">
          {department.name}
        </h3>
        <p className="text-text-secondary">{department.summary}</p>
        <div className="mt-auto pt-2">
          <CardAction department={department} />
        </div>
      </div>
    </article>
  );
}

function CardAction({ department }: { department: DepartmentCardData }) {
  const { state } = department;
  switch (state.kind) {
    case "member":
      return <StatusBadge tone="success">You&apos;re a member</StatusBadge>;
    case "requested":
      return (
        <div className="flex flex-col gap-2">
          <StatusBadge tone="pending">Request sent</StatusBadge>
          <p className="text-small text-text-muted">A department leader will review it.</p>
        </div>
      );
    case "coming_soon":
      return (
        <div className="flex flex-col gap-2">
          <StatusBadge tone="info">Coming soon</StatusBadge>
          <p className="text-small text-text-muted">Training opens when the curriculum is ready.</p>
        </div>
      );
    case "invite_only":
      return (
        <div className="flex flex-col gap-2">
          <StatusBadge tone="neutral">By invitation</StatusBadge>
          <p className="text-small text-text-muted">Ask the department leader for an invite.</p>
        </div>
      );
    case "can_request":
      return (
        <div className="flex flex-col gap-2">
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
        </div>
      );
    case "unavailable":
      return null;
  }
}
