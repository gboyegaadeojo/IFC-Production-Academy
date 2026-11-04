import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRightIcon, ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMyAchievements } from "@/lib/data/achievements";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards, type DepartmentCard as CardData } from "@/lib/data/departments";
import { getDepartmentLearning } from "@/lib/data/learning";
import { getMyOnboarding, getOpenDepartments } from "@/lib/data/onboarding";
import { getContinueLearning, type ContinueCourse } from "@/lib/data/progress";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import { homeState, type HomeState } from "@/lib/domain/home";
import { formatMinutes, stepHref } from "@/lib/domain/learning";
import { volunteerPathways } from "@/lib/domain/onboarding";
import { greetingName } from "@/lib/domain/people";
import { InstallApp } from "@/components/pwa/install-app";
import { ExploreRow, MemberDepartmentCard } from "./department-card";
import { NextSteps } from "./next-steps";
import { CoursePoster } from "@/components/course-poster";
import { getCourseLibrary, getStartHereCourses } from "@/lib/data/library";
import { libraryRows } from "@/lib/domain/library";

export const metadata: Metadata = { title: "Training" };

export default function TrainingPage() {
  return (
    <Suspense fallback={<TrainingSkeleton />}>
      <TrainingContent />
    </Suspense>
  );
}

/**
 * Training, the learner home (DESIGN §6.1; approved mock, 2026-11-01). One primary task per state:
 * - new: introduce the Academy and point to the departments
 * - pending: show the request status first
 * - member: one card per department you belong to, with level progress and one next step
 * "Other departments" lists only those you haven't joined, so nothing appears twice.
 */
async function TrainingContent() {
  const user = await requireActiveUser();
  const categories = await listDepartmentCards(user.id);
  // General categories are courses only, so they appear in the rows and never in "join a department".
  const departments = categories.filter((d) => d.kind === "team");
  const state = homeState(departments);
  const memberOf = departments.filter((d) => d.state.kind === "member");
  const others = departments.filter((d) => d.state.kind !== "member");
  const requested = departments.filter((d) => d.state.kind === "requested");
  const memberIds = memberOf.map((d) => d.id);
  const [learning, continuing, achievements, onboardingRows, openDepartments] = await Promise.all([
    getDepartmentLearning(user.id, memberIds),
    // Training is open to everyone (decision 2026-11-01): courses started in any department count.
    getContinueLearning(
      user.id,
      categories.map((d) => d.id),
    ),
    memberOf.length > 0 ? getMyAchievements(user.id) : null,
    getMyOnboarding(),
    getOpenDepartments(),
  ]);
  // Onboarding still in progress shows first; finished pathways drop off the Training page.
  const onboarding = volunteerPathways(onboardingRows).filter((p) => !p.finished);
  const learningFor = new Map(learning.map((entry) => [entry.departmentId, entry]));
  const lessonsTotal = learning.reduce(
    (n, entry) => n + entry.levels.reduce((m, level) => m + level.lessonsTotal, 0),
    0,
  );
  const lessonsDone = learning.reduce(
    (n, entry) => n + entry.levels.reduce((m, level) => m + level.lessonsDone, 0),
    0,
  );
  const current = continuing[0];

  return (
    <div className="page-container flex flex-col gap-8 py-6 sm:py-8 lg:gap-10 lg:py-10">
      <Hero
        name={greetingName(user.displayName, user.email)}
        state={state}
        stats={
          state === "member"
            ? [
                {
                  value: String(memberOf.length),
                  label: memberOf.length === 1 ? "department" : "departments",
                },
                {
                  value: String(continuing.length),
                  label: continuing.length === 1 ? "course in progress" : "courses in progress",
                },
                ...(lessonsTotal > 0
                  ? [{ value: `${lessonsDone}/${lessonsTotal}`, label: "lessons done" }]
                  : []),
              ]
            : []
        }
      />

      {current?.progress.next ? <ContinueCard continuing={current} /> : null}

      <Suspense fallback={null}>
        <StartHere userId={user.id} />
      </Suspense>

      <InstallApp variant="banner" />

      {onboarding.map((pathway) => (
        <NextSteps key={pathway.entryId} pathway={pathway} departments={openDepartments} />
      ))}

      {requested.length > 0 ? <RequestStatus requests={requested} /> : null}

      {memberOf.length > 0 ? (
        <section aria-labelledby="my-departments-heading" className="flex flex-col gap-4">
          <SectionHeading id="my-departments-heading" eyebrow="Your departments">
            Keep learning
          </SectionHeading>
          <ul className="grid gap-2 sm:gap-3 lg:grid-cols-2">
            {memberOf.map((department) => (
              <li key={department.id}>
                <MemberDepartmentCard
                  department={department}
                  learning={learningFor.get(department.id)}
                  approvedRoles={(achievements?.approvedRoles ?? [])
                    .filter((role) => role.departmentId === department.id)
                    .map((role) => role.roleName)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The rows load after the rest, so the next step never waits for them. */}
      <Suspense fallback={<Skeleton className="h-72" />}>
        <CourseRows userId={user.id} categories={categories} />
      </Suspense>

      <HowTrainingWorks open={state !== "member"} />

      <section
        id="departments"
        aria-labelledby="departments-heading"
        className="flex scroll-mt-20 flex-col gap-4"
      >
        <SectionHeading id="departments-heading" eyebrow="Explore">
          {memberOf.length > 0 ? "Other departments" : "Departments"}
        </SectionHeading>
        {departments.length === 0 ? (
          <EmptyState title="No departments are open yet">
            The production team is setting up its training. Check back soon, or ask a leader when
            your department opens.
          </EmptyState>
        ) : others.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-4 text-small text-text-secondary">
            You&apos;re in every open department. New ones appear here when they open.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {others.map((department) => (
              <li key={department.id} className="flex lg:last:odd:col-span-2">
                <ExploreRow
                  department={department}
                  continuing={continuing.find((c) => c.course.department.id === department.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The first Start here course not finished yet (SRS-CUR-018). A suggestion, never a gate. */
async function StartHere({ userId }: { userId: string }) {
  const course = (await getStartHereCourses(userId)).find((c) => c.state !== "completed");
  if (!course) {
    return null;
  }
  const started = course.state !== "not_started";
  return (
    <section
      aria-labelledby="start-here-heading"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="eyebrow">Start here</p>
        <h2 id="start-here-heading" className="text-subheading font-semibold">
          {course.title}
        </h2>
        <p className="text-small text-text-secondary">
          A good place for everyone on the team to begin.
          {course.estimatedMinutes ? ` About ${formatMinutes(course.estimatedMinutes)}.` : ""}
        </p>
      </div>
      <Link href={course.href} className={buttonClasses("primary", "shrink-0")}>
        {started ? "Continue" : "Start the course"}
        <span className="sr-only">: {course.title}</span>
        <ArrowRightIcon className="size-4" />
      </Link>
    </section>
  );
}

/** Rows of courses by category (Course Hierarchy mock, approved 2026-11-04; SRS-CUR-017). */
async function CourseRows({ userId, categories }: { userId: string; categories: CardData[] }) {
  const rows = libraryRows(await getCourseLibrary(userId, categories));
  if (rows.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="courses-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionHeading id="courses-heading" eyebrow="Explore">
          Courses
        </SectionHeading>
        <nav aria-label="Library" className="flex flex-wrap gap-2">
          {[
            { href: "/courses", label: "All courses" },
            { href: "/explore", label: "Explore" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={buttonClasses("secondary", "gap-1.5", "sm")}
            >
              {link.label}
              <ArrowRightIcon className="size-3.5" />
            </Link>
          ))}
        </nav>
      </div>
      {rows.map(({ category, courses }) => (
        <section
          key={category.id}
          aria-labelledby={`row-${category.id}`}
          className="flex flex-col gap-3"
        >
          <h3 id={`row-${category.id}`} className="font-semibold">
            <Link
              href={`/departments/${category.slug}`}
              className="inline-flex min-h-touch items-center gap-1 rounded-button underline-offset-4 hover:underline"
            >
              {category.name}
              <ChevronRightIcon className="size-4 text-text-muted" />
            </Link>
          </h3>
          {/* Scrolls sideways inside the row, never the page. */}
          <ul className="flex gap-3 overflow-x-auto pb-2">
            {courses.map((course) => (
              <li key={course.id} className="w-40 shrink-0 sm:w-44">
                <CoursePoster course={course} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
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
  stats,
}: {
  name: string | null;
  state: HomeState;
  stats: { value: string; label: string }[];
}) {
  const lead: Record<HomeState, string> = {
    new: "Learn the craft behind every service. Pick a department, learn its gear and routines at your own pace, and grow into serving with the production team.",
    pending:
      "Your request is with a department leader. While you wait, have a look at the other departments.",
    member: "",
  };

  return (
    <section aria-labelledby="welcome-heading" className="flex flex-col gap-3">
      <p className="eyebrow">Your training</p>
      <h1 id="welcome-heading" className="text-title font-semibold text-balance">
        {state === "member" ? "Welcome back" : "Welcome"}
        {name ? `, ${name}` : ""}
      </h1>
      {name ? null : (
        <p className="text-small text-text-secondary">
          What should we call you?{" "}
          <Link
            href="/profile"
            className="font-medium text-accent-light underline-offset-4 hover:underline"
          >
            Add your name
          </Link>
        </p>
      )}
      {stats.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {stats.map((stat) => (
            <li
              key={stat.label}
              className="flex items-baseline gap-1.5 rounded-pill border border-border bg-surface px-3 py-1 text-small text-text-secondary"
            >
              <span className="tabular font-semibold text-text">{stat.value}</span>
              {stat.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-[40rem] text-lead text-text-secondary">{lead[state]}</p>
      )}
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
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6"
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
        A leader reviews each request. You can start any course while you wait.
      </p>
    </section>
  );
}

/** Keeps membership, completion, and approval to serve visibly separate (SPEC §3, DESIGN §10). */
function HowTrainingWorks({ open }: { open: boolean }) {
  const steps = [
    {
      title: "Join a department",
      body: "Ask to join, or accept a leader's invitation. Any course is open to try.",
    },
    {
      title: "Learn and practise",
      body: "Work through each level's lessons and quizzes, then show the skills in a hands-on check.",
    },
    {
      title: "Approved to serve",
      body: "Granted when you pass the practical a role needs. Finishing lessons alone doesn't approve you.",
    },
  ];
  return (
    <details
      open={open}
      className="group rounded-card border border-border bg-card [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold">
        How serving works
        <ChevronDownIcon className="size-4 text-text-muted transition-surface group-open:rotate-180" />
      </summary>
      <ol className="grid gap-px border-t border-border bg-border md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-1.5 bg-card p-4">
            <span className="tabular text-small text-accent-light">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-medium">{step.title}</span>
            <span className="text-small text-text-secondary">{step.body}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * The one thing to do next (Training mock, approved 2026-11-02): the most recently opened course,
 * its next step, and progress, at the top of the page.
 */
function ContinueCard({ continuing }: { continuing: ContinueCourse }) {
  const next = continuing.progress.next;
  if (!next) {
    return null;
  }
  const { course, progress } = continuing;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;
  const label = `${progress.countedCompleted} of ${progress.countedTotal} ${continuing.hasRequired ? "required lessons" : "lessons"}`;
  return (
    <section aria-labelledby="continue-heading">
      <Link
        href={stepHref(course.id, next)}
        style={style}
        className="group relative grid lift grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 overflow-hidden rounded-card border border-border bg-surface p-4 pl-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5 sm:pl-6"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-[var(--dept)]" />
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-card bg-[color-mix(in_srgb,var(--dept)_12%,var(--surface))] text-[var(--dept)]"
        >
          <DepartmentIcon icon={course.department.icon} className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="eyebrow">Continue · {course.department.name}</span>
          <span
            id="continue-heading"
            className="text-subheading font-semibold transition-surface group-hover:text-accent-light"
          >
            {course.title}
          </span>
          <span className="text-small text-text-secondary">Next: {next.title}</span>
          <span className="mt-1.5 flex max-w-sm flex-col gap-1">
            <ProgressBar percent={progress.percent} label={`${course.title}: ${label}`} />
            <span className="text-small text-text-muted">{label}</span>
          </span>
        </span>
        <span className={buttonClasses("primary", "col-span-2 sm:col-span-1")}>
          Continue
          <ArrowRightIcon className="size-4" />
        </span>
      </Link>
    </section>
  );
}

function TrainingSkeleton() {
  return (
    <div className="page-container flex flex-col gap-12 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your training…" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-6 w-[36rem] max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-80" />
        ))}
      </div>
    </div>
  );
}
