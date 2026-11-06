import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AwardIcon, ChevronRightIcon } from "@/components/ui/icons";
import Loading from "./loading";
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
import { departmentProgress, levelProgressLabel, type DepartmentLearning } from "@/lib/domain/home";
import { initials } from "@/lib/domain/people";
import { membershipLabel } from "@/lib/domain/profile";
import { DisplayNameForm } from "./display-name-form";
import { courseHomeLabel } from "@/lib/domain/departments";
import { getMyQuizResults } from "@/lib/data/quiz-results";
import { QuizResults } from "./quiz-results";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
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
 * Your profile (SRS-AUTH-006; mock 5, approved 2026-11-06): your initials, name and Edit name,
 * three totals, the roles you're approved to serve, your departments, your quizzes, certificates,
 * and how you sign in. Membership, completion and approval to serve stay separate records (SPEC §3).
 */
async function ProfileContent() {
  const user = await requireActiveUser();
  const [profile, certificates, achievements, planningCenter, positionTeams, results] =
    await Promise.all([
      getMyProfile(user.id),
      getMyCertificates(user.id),
      getMyAchievements(user.id),
      getMyPlanningCenter(),
      getMyPositionTeams(user.id),
      getMyQuizResults(user.id),
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
  const departmentName = new Map(
    profile.memberships.map((m) => [m.departmentId, m.departmentName]),
  );
  const quizzesPassed = results.quizzes.filter((quiz) => quiz.passed).length;

  return (
    <div className="page-container py-8 lg:py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex flex-col items-center gap-1 text-center">
          <span
            aria-hidden="true"
            className="flex size-22 items-center justify-center rounded-pill bg-accent text-[1.75rem] font-semibold text-on-accent"
          >
            {initials(profile.displayName)}
          </span>
          <h1 className="mt-2.5 text-title font-bold tracking-tight">
            <span className="sr-only">Your profile: </span>
            {profile.displayName}
          </h1>
          <p className="text-small text-text-muted">
            Member since {formatDate(profile.joinedAt)} ·{" "}
            {planningCenter.linked ? "Planning Center" : "Email link"}
          </p>
          <div className="mt-2 w-full max-w-sm">
            <DisplayNameForm
              displayName={profile.displayName}
              planningCenterName={planningCenter.name}
              centered
            />
          </div>
        </header>

        <dl className="grid grid-cols-3 gap-2.5">
          <Total term="Lessons done" value={results.lessonsComplete} />
          <Total term="Quizzes passed" value={quizzesPassed} />
          <Total term="Approved" value={achievements.approvedRoles.length} />
        </dl>

        <section aria-labelledby="approved-heading" className="flex flex-col gap-3">
          <h2 id="approved-heading" className="text-subheading font-bold tracking-tight">
            Approved to serve
          </h2>
          {achievements.approvedRoles.length === 0 && learningPositions.length === 0 ? (
            <p className="rounded-card bg-card px-4 py-3.5 text-small text-text-secondary">
              Not yet. Passing a role&apos;s practical approves you, and it shows here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card bg-card">
              {achievements.approvedRoles.map((role) => (
                <RoleRow
                  key={role.roleId}
                  role={role.roleName}
                  department={departmentName.get(role.departmentId)}
                  tone="success"
                  label="Approved"
                />
              ))}
              {learningPositions.map((role) => (
                <RoleRow
                  key={role.roleId}
                  role={role.roleName}
                  department={departmentName.get(role.departmentId)}
                  tone="pending"
                  label="Still learning"
                />
              ))}
            </ul>
          )}
        </section>

        <Departments memberships={profile.memberships} learningFor={learningFor} />

        <QuizResults
          quizzes={results.quizzes}
          lessonsComplete={results.lessonsComplete}
          showTotals={false}
        />

        <Certificates certificates={certificates} />

        <section aria-labelledby="details-heading" className="flex flex-col gap-3">
          <h2 id="details-heading" className="text-subheading font-bold tracking-tight">
            How you sign in
          </h2>
          <dl className="flex flex-col gap-3 rounded-card bg-card px-4 py-4 text-small">
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
      </div>
    </div>
  );
}

function Total({ term, value }: { term: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-card bg-card px-3.5 py-3">
      <dt className="text-small text-text-muted">{term}</dt>
      <dd className="tabular text-title font-bold">{value}</dd>
    </div>
  );
}

function RoleRow({
  role,
  department,
  tone,
  label,
}: {
  role: string;
  department: string | undefined;
  tone: StatusTone;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{role}</span>
        {department ? <span className="text-small text-text-muted">{department}</span> : null}
      </span>
      <StatusBadge tone={tone}>{label}</StatusBadge>
    </li>
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
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-subheading font-bold tracking-tight">
        {title}
      </h2>
      {aside ? <span className="text-small text-text-muted">{aside}</span> : null}
    </div>
  );
}

function Departments({
  memberships,
  learningFor,
}: {
  memberships: MyProfile["memberships"];
  learningFor: Map<string, DepartmentLearning>;
}) {
  const active = memberships.filter((m) => m.status === "active").length;
  return (
    <section aria-labelledby="departments-heading" className="flex flex-col gap-3">
      <PanelHeading
        id="departments-heading"
        title="Departments"
        aside={active > 0 ? `${active} ${active === 1 ? "department" : "departments"}` : undefined}
      />
      {memberships.length === 0 ? (
        <p className="rounded-card bg-card px-4 py-3.5 text-small text-text-secondary">
          You haven&apos;t asked to join a department yet. Pick one on your{" "}
          <Link href="/home" className="text-accent-light underline underline-offset-4">
            Training page
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card bg-card">
          {memberships.map((membership) => {
            const learning = learningFor.get(membership.departmentId);
            const { total, percent } = departmentProgress(learning?.levels ?? []);
            return (
              <li
                key={membership.id}
                style={{ "--dept": departmentHueVar(membership.departmentHue) } as CSSProperties}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-pill bg-[var(--dept)]"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{membership.departmentName}</span>
                  <span className="text-small text-text-muted">
                    {membershipLine(membership, learning)}
                  </span>
                </span>
                {membership.status === "active" ? (
                  total > 0 ? (
                    <span className="tabular shrink-0 text-small text-text-secondary">
                      {percent}%<span className="sr-only"> of lessons complete</span>
                    </span>
                  ) : null
                ) : (
                  <StatusBadge tone={MEMBERSHIP_TONES[membership.status]}>
                    {membershipLabel(membership.status)}
                  </StatusBadge>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-small text-text-muted">
        Membership puts you on a department&apos;s team. Approval to serve a role comes separately,
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
    <section aria-labelledby="certificates-heading" className="flex flex-col gap-3">
      <PanelHeading id="certificates-heading" title="Certificates" />
      {certificates.length === 0 ? (
        <div className="flex items-center gap-3.5 rounded-card bg-card px-4 py-4 text-small text-text-secondary">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-button border border-border bg-card text-text-muted">
            <AwardIcon className="size-[18px]" />
          </span>
          None yet. Finish a course and its certificate appears here, ready to download.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card bg-card">
          {certificates.map((certificate) => (
            <li key={certificate.reference}>
              <Link
                href={`/certificates/${certificate.reference}`}
                className="group flex min-h-touch items-center gap-3.5 px-4 py-3.5 transition-surface hover:bg-hover"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-button border border-border bg-card text-accent-light">
                  <AwardIcon className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-text">{certificate.courseTitle}</span>
                  <span className="text-small text-text-muted">
                    {courseHomeLabel(certificate.departmentName, certificate.levelNumber)} · issued{" "}
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
