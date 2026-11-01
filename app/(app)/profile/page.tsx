import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { AwardIcon, ChevronRightIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { getMyAchievements } from "@/lib/data/achievements";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCertificates } from "@/lib/data/certificates";
import { getDepartmentLearning } from "@/lib/data/learning";
import {
  getMyPlanningCenter,
  getMyPositionTeams,
  getMyProfile,
  type MyProfile,
} from "@/lib/data/profile";
import { stillLearningPositions } from "@/lib/domain/teams";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar, type MembershipStatus } from "@/lib/domain/departments";
import { levelProgressLabel, type DepartmentLearning } from "@/lib/domain/home";
import { initials } from "@/lib/domain/people";
import { membershipLabel } from "@/lib/domain/profile";
import { DisplayNameForm } from "./display-name-form";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}

const MEMBERSHIP_TONES: Record<MembershipStatus, StatusTone> = {
  active: "neutral",
  requested: "pending",
  declined: "neutral",
  removed: "neutral",
};

/**
 * Your profile (SRS-AUTH-006; approved mock, 2026-11-01): who you are and how you sign in, your
 * departments with Approved to Serve per role, and your certificates. Membership, completion and
 * approval to serve stay separate records (SPEC §3).
 */
async function ProfileContent() {
  const user = await requireActiveUser();
  const [profile, certificates, achievements, planningCenter, positionTeams] = await Promise.all([
    getMyProfile(user.id),
    getMyCertificates(user.id),
    getMyAchievements(user.id),
    getMyPlanningCenter(),
    getMyPositionTeams(user.id),
  ]);
  if (!profile) {
    notFound();
  }
  const activeIds = profile.memberships
    .filter((m) => m.status === "active")
    .map((m) => m.departmentId);
  const learning = await getDepartmentLearning(user.id, activeIds);
  const learningFor = new Map(learning.map((entry) => [entry.departmentId, entry]));
  const learningPositions = stillLearningPositions(
    positionTeams,
    new Set(achievements.approvedRoles.map((role) => role.roleId)),
  );

  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Account</p>
        <h1 className="text-display font-semibold">Your profile</h1>
        <p className="max-w-[40rem] text-lead text-text-secondary">
          How you appear to leaders, and where you&apos;re training and serving.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
        <section
          aria-labelledby="identity-heading"
          className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6"
        >
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-pill border border-border-strong bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_22%,var(--card)),var(--card))] text-[1.375rem] font-semibold"
            >
              {initials(profile.displayName)}
            </span>
            <div className="flex min-w-0 flex-col">
              <h2 id="identity-heading" className="truncate text-heading font-semibold">
                {profile.displayName}
              </h2>
              <span className="text-small text-text-muted">
                Member since {formatDate(profile.joinedAt)}
              </span>
            </div>
          </div>
          <DisplayNameForm
            displayName={profile.displayName}
            planningCenterName={planningCenter.name}
          />
          <dl className="flex flex-col gap-3 border-t border-border pt-4 text-small">
            <Detail term="Signs in with">
              {planningCenter.linked ? "Planning Center" : "Email link"}
            </Detail>
            {profile.email ? (
              <Detail term="Email">
                <span className="break-all">{profile.email}</span>
              </Detail>
            ) : null}
            {planningCenter.teams.length > 0 ? (
              <Detail
                term={
                  planningCenter.teams.length === 1
                    ? "Planning Center team"
                    : "Planning Center teams"
                }
              >
                <ul className="flex flex-col items-end gap-0.5">
                  {planningCenter.teams.map((team) => (
                    <li key={team}>{team}</li>
                  ))}
                </ul>
              </Detail>
            ) : null}
            <Detail term="Roles">
              <ul className="flex flex-col items-end gap-0.5">
                {profile.roles.map((role) => (
                  <li key={role.id}>
                    {role.departmentName
                      ? `${role.roleName}, ${role.departmentName}`
                      : role.roleName}
                  </li>
                ))}
              </ul>
            </Detail>
          </dl>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <Departments
            memberships={profile.memberships}
            learningFor={learningFor}
            approved={achievements.approvedRoles}
            learning={learningPositions}
          />
          <Certificates certificates={certificates} />
        </div>
      </div>
    </div>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{term}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function PanelHeading({ id, title, aside }: { id: string; title: string; aside?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {aside ? <span className="text-small text-text-muted">{aside}</span> : null}
    </div>
  );
}

function Departments({
  memberships,
  learningFor,
  approved,
  learning,
}: {
  memberships: MyProfile["memberships"];
  learningFor: Map<string, DepartmentLearning>;
  approved: { departmentId: string; roleId: string; roleName: string }[];
  /** Positions whose team you're on but aren't approved in yet. */
  learning: { departmentId: string; roleId: string; roleName: string }[];
}) {
  const active = memberships.filter((m) => m.status === "active").length;
  return (
    <section
      aria-labelledby="departments-heading"
      className="rounded-card border border-border bg-surface"
    >
      <PanelHeading
        id="departments-heading"
        title="Departments and roles"
        aside={active > 0 ? `${active} ${active === 1 ? "department" : "departments"}` : undefined}
      />
      {memberships.length === 0 ? (
        <p className="px-5 py-5 text-small text-text-secondary">
          You haven&apos;t asked to join a department yet. Pick one on your{" "}
          <Link href="/home" className="text-accent-light underline underline-offset-4">
            Training page
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {memberships.map((membership) => {
            const roles = approved.filter((r) => r.departmentId === membership.departmentId);
            return (
              <li
                key={membership.id}
                style={{ "--dept": departmentHueVar(membership.departmentHue) } as CSSProperties}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 px-5 py-3.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
              >
                <span className="flex size-10 items-center justify-center rounded-button border border-border bg-card text-[var(--dept)]">
                  <DepartmentIcon icon={membership.departmentIcon} className="size-[18px]" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{membership.departmentName}</span>
                  <span className="text-small text-text-secondary">
                    {membershipLine(membership, learningFor.get(membership.departmentId))}
                  </span>
                </div>
                <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-3 sm:justify-end">
                  <StatusBadge tone={MEMBERSHIP_TONES[membership.status]}>
                    {membershipLabel(membership.status)}
                  </StatusBadge>
                  {roles.map((role) => (
                    <StatusBadge key={role.roleId} tone="success">
                      Approved: {role.roleName}
                    </StatusBadge>
                  ))}
                  {learning
                    .filter((r) => r.departmentId === membership.departmentId)
                    .map((role) => (
                      <StatusBadge key={role.roleId} tone="pending">
                        Still learning: {role.roleName}
                      </StatusBadge>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-border px-5 py-3.5 text-small text-text-muted">
        Membership opens a department&apos;s training. Approval to serve a role comes separately,
        after its practical assessment.
      </p>
    </section>
  );
}

/** The first level with published courses and its progress, or an honest placeholder. */
function membershipLine(
  membership: MyProfile["memberships"][number],
  learning: DepartmentLearning | undefined,
): string {
  if (membership.status === "requested") {
    return `Asked ${formatDate(membership.updatedAt)}`;
  }
  if (membership.status !== "active") {
    return `Since ${formatDate(membership.updatedAt)}`;
  }
  const level = learning?.levels.find((l) => l.publishedCourses > 0);
  return level
    ? `Level ${level.number} · ${levelProgressLabel(level)}`
    : "Courses are being prepared";
}

function Certificates({
  certificates,
}: {
  certificates: Awaited<ReturnType<typeof getMyCertificates>>;
}) {
  return (
    <section
      aria-labelledby="certificates-heading"
      className="rounded-card border border-border bg-surface"
    >
      <PanelHeading id="certificates-heading" title="Certificates" />
      {certificates.length === 0 ? (
        <div className="flex items-center gap-3.5 px-5 py-5 text-small text-text-secondary">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-button border border-border bg-card text-text-muted">
            <AwardIcon className="size-[18px]" />
          </span>
          None yet. Finish a course and its certificate appears here, ready to download.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {certificates.map((certificate) => (
            <li key={certificate.reference}>
              <Link
                href={`/certificates/${certificate.reference}`}
                className="group flex min-h-touch items-center gap-3.5 px-5 py-3.5 transition-surface hover:bg-card"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-button border border-border bg-card text-accent-light">
                  <AwardIcon className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-text">{certificate.courseTitle}</span>
                  <span className="text-small text-text-muted">
                    {certificate.departmentName} · Level {certificate.levelNumber} · issued{" "}
                    {formatDate(certificate.issuedAt)}
                  </span>
                </span>
                {certificate.revoked ? <StatusBadge tone="neutral">Withdrawn</StatusBadge> : null}
                <ChevronRightIcon className="size-4 shrink-0 text-text-muted group-hover:text-text" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your profile…" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
        <Skeleton className="h-80" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-64" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </div>
  );
}
