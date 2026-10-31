import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRightIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMyAchievements, type Achievements } from "@/lib/data/achievements";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards, type DepartmentCard as CardData } from "@/lib/data/departments";
import { getDepartmentLearning } from "@/lib/data/learning";
import { getMyPairings } from "@/lib/data/mentoring";
import { getContinueLearning } from "@/lib/data/progress";
import { formatDateTime } from "@/lib/domain/admin";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  courseCountLabel,
  homeState,
  type DepartmentLearning,
  type HomeState,
} from "@/lib/domain/home";
import { ContinueLearning } from "./continue-learning";
import { DepartmentCard } from "./department-card";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

/**
 * Learner home (DESIGN §6.1): one primary task per state, then the learning world.
 * - new: introduce the Academy and point to the departments
 * - pending: show the request status first
 * - member: show the person's departments and what's published in them
 */
async function HomeContent() {
  const user = await requireActiveUser();
  const departments = await listDepartmentCards(user.id);
  const state = homeState(departments);
  const memberOf = departments.filter((d) => d.state.kind === "member");
  const requested = departments.filter((d) => d.state.kind === "requested");
  const [learning, continuing, achievements, pairings] = await Promise.all([
    getDepartmentLearning(memberOf.map((d) => d.id)),
    getContinueLearning(
      user.id,
      memberOf.map((d) => d.id),
    ),
    memberOf.length > 0 ? getMyAchievements(user.id) : null,
    getMyPairings(),
  ]);
  const activePairings = pairings.filter((p) => p.endedAt === null);
  const learningFor = new Map(learning.map((entry) => [entry.departmentId, entry]));

  return (
    <div className="page-container flex flex-col gap-12 py-8 lg:gap-16 lg:py-14">
      <Hero
        name={user.displayName}
        state={state}
        memberCount={memberOf.length}
        learning={learning}
      />

      {continuing.length > 0 ? <ContinueLearning courses={continuing} /> : null}

      {achievements &&
      (achievements.approvedRoles.length > 0 || achievements.certificates.length > 0) ? (
        <AchievementsSection achievements={achievements} />
      ) : null}

      {activePairings.length > 0 ? (
        <section aria-labelledby="mentoring-heading" className="flex flex-col gap-3">
          <SectionHeading id="mentoring-heading" eyebrow="Mentoring">
            Your mentoring
          </SectionHeading>
          <ul className="grid gap-3 lg:grid-cols-2">
            {activePairings.map((pairing) => (
              <li key={pairing.id}>
                <Link
                  href={`/mentoring/${pairing.id}`}
                  className="flex h-full flex-col gap-1 rounded-card border border-border bg-card p-5 transition-surface hover:bg-hover"
                >
                  <span className="font-medium text-text">
                    {pairing.myPart === "mentor"
                      ? `Mentoring ${pairing.mentee.name}`
                      : `Mentored by ${pairing.mentor.name}`}
                  </span>
                  <span className="text-small text-text-muted">{pairing.departmentName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {requested.length > 0 ? <RequestStatus requests={requested} /> : null}

      {memberOf.length > 0 ? (
        <section aria-labelledby="my-departments-heading" className="flex flex-col gap-4">
          <SectionHeading id="my-departments-heading" eyebrow="Your training">
            Your departments
          </SectionHeading>
          <ul className="grid gap-4 lg:grid-cols-2">
            {memberOf.map((department) => (
              <li key={department.id}>
                <MyDepartment department={department} learning={learningFor.get(department.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HowTrainingWorks />

      <section
        id="departments"
        aria-labelledby="departments-heading"
        className="flex scroll-mt-20 flex-col gap-5"
      >
        <SectionHeading id="departments-heading" eyebrow="Explore">
          Departments
        </SectionHeading>
        {departments.length === 0 ? (
          <EmptyState title="No departments are open yet">
            The production team is setting up its training. Check back soon, or ask a leader when
            your department opens.
          </EmptyState>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {departments.map((department) => (
              <li key={department.id} className="flex">
                <DepartmentCard
                  department={department}
                  publishedCourses={learningFor.get(department.id)?.publishedCourses ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow: string;
  children: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="text-heading font-semibold">
        {children}
      </h2>
    </div>
  );
}

function Hero({
  name,
  state,
  memberCount,
  learning,
}: {
  name: string;
  state: HomeState;
  memberCount: number;
  learning: DepartmentLearning[];
}) {
  const published = learning.reduce((total, entry) => total + entry.publishedCourses, 0);
  const lead: Record<HomeState, string> = {
    new: "Learn the craft behind every service. Pick a department, learn its gear and routines at your own pace, and grow into serving with the production team.",
    pending:
      "Your request is with a department leader. While you wait, have a look at the other departments.",
    member:
      published > 0
        ? `${courseCountLabel(published)} published across your ${memberCount === 1 ? "department" : "departments"}. Pick up where your pathway starts.`
        : "You're in. Your department's courses are being prepared and will appear here as soon as they're published.",
  };

  return (
    <section aria-labelledby="welcome-heading" className="flex flex-col gap-5">
      <p className="eyebrow">IFC Production Academy</p>
      <h1 id="welcome-heading" className="text-display font-semibold text-balance">
        Welcome, {name}
      </h1>
      <p className="max-w-[40rem] text-lead text-text-secondary">{lead[state]}</p>
      {state === "new" ? (
        <div>
          <a href="#departments" className={buttonClasses("primary", "gap-2")}>
            Explore departments
            <ArrowRightIcon className="size-4" />
          </a>
        </div>
      ) : null}
    </section>
  );
}

function RequestStatus({ requests }: { requests: CardData[] }) {
  return (
    <section
      aria-labelledby="requests-heading"
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Membership</p>
        <h2 id="requests-heading" className="text-heading font-semibold">
          {requests.length === 1 ? "Your request" : "Your requests"}
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {requests.map((request) => (
          <li
            key={request.id}
            style={{ "--dept": departmentHueVar(request.hue) } as CSSProperties}
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-[var(--dept)]">
                <DepartmentIcon icon={request.icon} className="size-5" />
              </span>
              <div className="flex flex-col">
                <span className="font-medium">{request.name}</span>
                {request.since ? (
                  <span className="text-small text-text-muted">
                    Asked {formatDateTime(request.since)}
                  </span>
                ) : null}
              </div>
            </div>
            <StatusBadge tone="pending">Waiting for a leader</StatusBadge>
          </li>
        ))}
      </ul>
      <p className="text-small text-text-secondary">
        A leader reviews each request. When it&apos;s approved, the department&apos;s training
        appears on this page.
      </p>
    </section>
  );
}

function MyDepartment({
  department,
  learning,
}: {
  department: CardData;
  learning: DepartmentLearning | undefined;
}) {
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;
  return (
    <div
      style={style}
      className="flex h-full flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-button border border-border text-[var(--dept)]">
            <DepartmentIcon icon={department.icon} className="size-5" />
          </span>
          <div className="flex flex-col">
            <h3 id={`mine-${department.id}`} className="text-subheading font-semibold">
              {department.name}
            </h3>
            {department.since ? (
              <span className="text-small text-text-muted">
                Member since {formatDateTime(department.since)}
              </span>
            ) : null}
          </div>
        </div>
        <StatusBadge tone="success">Member</StatusBadge>
      </div>
      {learning && learning.levels.length > 0 ? (
        <ol className="grid gap-2 sm:grid-cols-3">
          {learning.levels.map((level) => (
            <li
              key={level.levelId}
              className="flex flex-col gap-0.5 rounded-button border border-border px-3 py-2"
            >
              <span className="eyebrow">Level {level.number}</span>
              <span className="text-small font-medium text-text">{level.name}</span>
              <span className="text-small text-text-muted">
                {level.publishedCourses === 0
                  ? "No courses yet"
                  : courseCountLabel(level.publishedCourses)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="text-small text-text-secondary">
        {learning?.publishedCourses
          ? "Membership gives you the training; approval to serve comes later, after the hands-on checks."
          : "Courses are being prepared. Membership gives you the training; approval to serve comes later, after the hands-on checks."}
      </p>
      <Link
        href={`/departments/${department.slug}`}
        className={buttonClasses("primary", "self-start")}
      >
        {learning?.publishedCourses ? "Open your pathway" : "View department"}
        <span className="sr-only"> for {department.name}</span>
        <ArrowRightIcon className="size-4" />
      </Link>
    </div>
  );
}

/** Keeps membership, completion, and approval to serve visibly separate (SPEC §3, DESIGN §10). */
/**
 * Recent achievements (SPEC §7 "Home dashboard"): roles the person is Approved to Serve in, and
 * certificates. Shown side by side but never merged: a certificate is not approval to serve.
 */
function AchievementsSection({ achievements }: { achievements: Achievements }) {
  return (
    <section aria-labelledby="achievements-heading" className="flex flex-col gap-4">
      <SectionHeading id="achievements-heading" eyebrow="Your achievements">
        What you&apos;ve earned
      </SectionHeading>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
          <h3 className="font-medium">Approved to serve</h3>
          {achievements.approvedRoles.length === 0 ? (
            <p className="text-small text-text-secondary">
              Not yet. Pass a role&apos;s practical assessments and it shows here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {achievements.approvedRoles.map((role) => (
                <li key={role.roleId} className="flex flex-col">
                  <span className="font-medium">{role.roleName}</span>
                  <span className="text-small text-text-muted">
                    {role.departmentName} · since {formatDate(role.approvedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
          <h3 className="font-medium">Certificates</h3>
          {achievements.certificates.length === 0 ? (
            <p className="text-small text-text-secondary">
              Finish a course and get its certificate from the course page.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {achievements.certificates.slice(0, 3).map((certificate) => (
                <li key={certificate.reference}>
                  <Link
                    href={`/certificates/${certificate.reference}`}
                    className="flex flex-col rounded-button underline-offset-4 hover:underline"
                  >
                    <span className="font-medium text-accent-light">{certificate.courseTitle}</span>
                    <span className="text-small text-text-muted">
                      {certificate.departmentName} · {formatDate(certificate.issuedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function HowTrainingWorks() {
  const steps = [
    {
      title: "Join a department",
      body: "Ask to join, or accept a leader's invitation. Joining opens the department's training.",
    },
    {
      title: "Learn and practise",
      body: "Work through each level's lessons and quizzes, then show the skills in a hands-on check.",
    },
    {
      title: "Approved to serve",
      body: "Granted when you pass the practical skills a role needs. Finishing lessons alone doesn't approve you.",
    },
  ];
  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-4">
      <SectionHeading id="how-heading" eyebrow="How it works">
        From joining to serving
      </SectionHeading>
      <ol className="grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2 bg-bg p-5">
            <span className="tabular font-mono text-small text-accent-light">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-medium">{step.title}</span>
            <span className="text-small text-text-secondary">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="page-container flex flex-col gap-12 py-8 lg:py-14" aria-busy="true">
      <LoadingStatus label="Loading your home page…" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-6 w-[36rem] max-w-full" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-96" />
        ))}
      </div>
    </div>
  );
}
