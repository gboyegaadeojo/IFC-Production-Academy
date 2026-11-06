import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InstallApp } from "@/components/pwa/install-app";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CalendarRangeIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  ListChecksIcon,
  PlayIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyAchievements } from "@/lib/data/achievements";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyAssignedCourses } from "@/lib/data/course-assignments";
import { listDepartmentCards, type DepartmentCard as CardData } from "@/lib/data/departments";
import { getDepartmentLearning } from "@/lib/data/learning";
import { getCourseLibrary, getStartHereCourses } from "@/lib/data/library";
import { getMyOnboarding, getOpenDepartments } from "@/lib/data/onboarding";
import { getContinueLearning, getRecentlyWatched } from "@/lib/data/progress";
import { getMyUpcomingAssignments } from "@/lib/data/schedule";
import {
  comingUp,
  courseSuggestions,
  gettingStarted,
  type PlanItem,
  type PlanNext,
} from "@/lib/domain/coming-up";
import { homeState } from "@/lib/domain/home";
import { volunteerPathways } from "@/lib/domain/onboarding";
import { greetingName } from "@/lib/domain/people";
import { READINESS_LABELS } from "@/lib/domain/schedule";
import {
  servingSpotlight,
  timeOfDayGreeting,
  type RecentLesson,
  type ServingSpotlight,
} from "@/lib/domain/training-home";
import { LessonThumbnail } from "@/app/(app)/courses/[courseId]/(summary)/lesson-panel";
import { CoursePoster } from "@/components/course-poster";
import { DepartmentTile, ExploreRow } from "./department-card";
import Loading from "./loading";
import { NextSteps } from "./next-steps";

export const metadata: Metadata = { title: "Training" };

export default function TrainingPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TrainingContent />
    </Suspense>
  );
}

/**
 * Training, the learner home (DESIGN §6.1; mock 5 and its refinements, approved 2026-11-06). A
 * greeting, then the service you're on next and the one thing to pick up, with this month's
 * services beside them on wide screens. Below, at full width: shortcuts, your departments in a row
 * that scrolls sideways, what you watched recently, and courses to try. Notifications live under
 * the bell. Someone new sees Getting started instead of the plan.
 */
async function TrainingContent() {
  const user = await requireActiveUser();
  const categories = await listDepartmentCards(user.id);
  // General categories are courses only, so they never appear in "join a department".
  const departments = categories.filter((d) => d.kind === "team");
  const state = homeState(departments);
  const memberOf = departments.filter((d) => d.state.kind === "member");
  const others = departments.filter((d) => d.state.kind !== "member");
  const [
    learning,
    continuing,
    achievements,
    onboardingRows,
    openDepartments,
    assigned,
    startHere,
    assignments,
  ] = await Promise.all([
    getDepartmentLearning(
      user.id,
      memberOf.map((d) => d.id),
    ),
    // Training is open to everyone (decision 2026-11-01): courses started in any department count.
    getContinueLearning(
      user.id,
      categories.map((d) => d.id),
    ),
    memberOf.length > 0 ? getMyAchievements(user.id) : null,
    getMyOnboarding(),
    getOpenDepartments(),
    getMyAssignedCourses(user.id),
    getStartHereCourses(user.id),
    getMyUpcomingAssignments(user.id),
  ]);
  // Onboarding still in progress shows first; finished pathways drop off the Training page.
  const onboarding = volunteerPathways(onboardingRows).filter((p) => !p.finished);
  const learningFor = new Map(learning.map((entry) => [entry.departmentId, entry]));
  const name = greetingName(user.displayName, user.email);
  const now = new Date();

  const planContinuing = continuing.flatMap((item) =>
    item.progress.next
      ? [
          {
            courseId: item.course.id,
            courseTitle: item.course.title,
            nextTitle: item.progress.next.title,
            nextHref: item.nextHref,
            nextLesson: item.nextLesson,
            practical: item.practical,
          },
        ]
      : [],
  );
  const spotlight = servingSpotlight(
    assignments.map((assignment) => ({
      id: assignment.id,
      eventId: assignment.event.id,
      roleId: assignment.roleId,
      status: assignment.status,
      readiness: assignment.readiness,
      startsAt: assignment.event.startsAt,
      endsAt: assignment.event.endsAt,
      roleName: assignment.roleName,
      eventTitle: assignment.event.title,
    })),
    now,
  );
  const plan = comingUp({
    continuing: planContinuing,
    assigned,
    startHere,
    // The card at the top already shows the next service.
    servings: assignments
      .filter((assignment) => assignment.id !== spotlight?.id)
      .map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
        startsAt: assignment.event.startsAt,
        endsAt: assignment.event.endsAt,
        roleName: assignment.roleName,
      })),
    now,
  });
  const newcomer =
    state !== "member" &&
    planContinuing.length === 0 &&
    assigned.length === 0 &&
    plan.thisWeek.length === 0 &&
    spotlight === null;
  const inPlan = new Set([
    ...planContinuing.map((item) => item.courseId),
    ...assigned.map((course) => course.id),
    ...startHere.map((course) => course.id),
  ]);
  const thisMonth = assignments
    .filter(
      (assignment) =>
        assignment.status !== "declined" &&
        new Date(assignment.event.startsAt).getTime() - now.getTime() < MONTH_MS,
    )
    .slice(0, 4);
  const alsoComingUp = [...plan.thisWeek, ...plan.whenReady];

  return (
    <div className="page-container flex flex-col gap-6 py-5 sm:py-8 lg:pb-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight text-balance sm:text-[2rem]">
          {timeOfDayGreeting(now)}
          {name ? `, ${name}` : ""}
        </h1>
        {!name && !newcomer ? (
          <p className="text-small text-text-secondary">
            What should we call you?{" "}
            <Link
              href="/profile"
              className="font-medium text-accent-light underline-offset-4 hover:underline"
            >
              Add your name
            </Link>
          </p>
        ) : null}
      </div>

      {/* What's next sits beside this month's services; everything below uses the full width. */}
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-7">
          {onboarding.map((pathway) => (
            <NextSteps key={pathway.entryId} pathway={pathway} departments={openDepartments} />
          ))}
          {spotlight ? <ServingCard spotlight={spotlight} /> : null}
          {newcomer ? (
            <GettingStarted
              hasName={name !== null}
              department={state === "pending" ? "requested" : "none"}
              startHere={startHere}
            />
          ) : (
            <>
              <Section id="pick-up-heading" title="Pick up where you left off">
                {plan.next ? (
                  <NextBlock next={plan.next} />
                ) : (
                  <p className="text-text-secondary">
                    You&apos;re all caught up. Find something new in{" "}
                    <Link
                      href="/courses"
                      className="font-medium text-accent-light underline-offset-4 hover:underline"
                    >
                      Courses
                    </Link>
                    .
                  </p>
                )}
              </Section>
              {alsoComingUp.length > 0 ? (
                <Section id="coming-up-heading" title="Coming up">
                  <ul className="flex flex-col">
                    {alsoComingUp.map((item) => (
                      <li key={item.key}>
                        <PlanRow item={item} />
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </>
          )}
        </div>

        <section
          aria-labelledby="this-month-heading"
          className="hidden min-w-0 flex-col rounded-[1.25rem] border border-border bg-surface px-4 pt-4 pb-1 lg:flex"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="this-month-heading" className="text-body font-bold">
              This month
            </h2>
            <Link
              href="/schedule"
              className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
            >
              Your schedule
            </Link>
          </div>
          {thisMonth.length === 0 ? (
            <p className="py-2 text-small text-text-muted">
              You&apos;re not on the schedule this month.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {thisMonth.map((assignment) => (
                <li key={assignment.id}>
                  <ServiceRow
                    startsAt={assignment.event.startsAt}
                    role={assignment.roleName}
                    event={assignment.event.title}
                    label={
                      assignment.status === "pending"
                        ? "Please reply"
                        : READINESS_LABELS[assignment.readiness]
                    }
                    trained={assignment.status !== "pending" && assignment.readiness === "approved"}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Shortcuts />
      {memberOf.length > 0 ? (
        <ScrollRail
          id="my-departments-heading"
          title="Your departments"
          aside={<span className="text-small text-text-muted">{memberOf.length}</span>}
        >
          {memberOf.map((department) => (
            <li key={department.id}>
              <DepartmentTile
                department={department}
                learning={learningFor.get(department.id)}
                approvedRoles={(achievements?.approvedRoles ?? [])
                  .filter((role) => role.departmentId === department.id)
                  .map((role) => role.roleName)}
              />
            </li>
          ))}
        </ScrollRail>
      ) : null}
      <Suspense fallback={null}>
        <RecentlyWatched userId={user.id} />
      </Suspense>
      {departments.length === 0 ? (
        <EmptyState title="No departments are open yet">
          The production team is setting up its training. Check back soon, or ask a leader when your
          department opens.
        </EmptyState>
      ) : others.length > 0 ? (
        <section
          id="departments"
          aria-labelledby="departments-heading"
          className="flex scroll-mt-20 flex-col gap-1 rounded-card border border-border bg-surface p-4"
        >
          <h2 id="departments-heading" className="mb-1 text-subheading font-bold">
            {memberOf.length > 0 ? "Other departments" : "Choose a department"}
          </h2>
          <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((department) => (
              <li key={department.id}>
                <ExploreRow department={department} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {/* These load after the rest, so the next step never waits for them. */}
      <Suspense fallback={<Skeleton className="h-56" />}>
        <KeepExploring userId={user.id} categories={categories} inPlan={inPlan} />
      </Suspense>
      {newcomer ? null : <InstallApp variant="banner" />}
      <HowTrainingWorks />
    </div>
  );
}

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;
const WINNIPEG = "America/Winnipeg";
const WEEKDAY = new Intl.DateTimeFormat("en-CA", { timeZone: WINNIPEG, weekday: "short" });
const DAY_OF_MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: WINNIPEG, day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: WINNIPEG,
  hour: "numeric",
  minute: "2-digit",
});

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-subheading font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The service you're on next, as a bold card (mock 5). It shows only when you're scheduled.
 * Training is shown beside it, never a gate. The second button is the checklist or the schedule,
 * since those are used far more than SOPs (G, 2026-11-06).
 */
function ServingCard({ spotlight }: { spotlight: ServingSpotlight }) {
  return (
    <section
      aria-labelledby="serving-heading"
      className="flex flex-col gap-4 rounded-[1.25rem] bg-text p-5 text-bg sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-small font-bold tracking-wide uppercase opacity-60">
          {spotlight.eyebrow}
        </p>
        <h2 id="serving-heading" className="text-[1.375rem] leading-tight font-bold tracking-tight">
          {spotlight.title}
        </h2>
        <p className="text-small opacity-70">{spotlight.detail}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {spotlight.needsReply ? (
          <>
            <Link href="/schedule" className={SERVING_PRIMARY}>
              Reply on Schedule
            </Link>
            <Link href={spotlight.checklistHref} className={SERVING_SECONDARY}>
              Checklist
            </Link>
          </>
        ) : (
          <>
            <Link href={spotlight.checklistHref} className={SERVING_PRIMARY}>
              <ListChecksIcon className="size-4" />
              Open checklist
            </Link>
            <Link href="/schedule" className={SERVING_SECONDARY}>
              Schedule
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

const SERVING_PRIMARY =
  "inline-flex min-h-button items-center gap-1.5 rounded-pill bg-bg px-4 font-semibold text-text";
const SERVING_SECONDARY =
  "inline-flex min-h-button items-center rounded-pill px-4 font-semibold ring-1 ring-bg/40 ring-inset";

const SHORTCUTS = [
  { href: "/serve", label: "Checklist", icon: ListChecksIcon },
  { href: "/schedule", label: "Schedule", icon: CalendarRangeIcon },
  { href: "/sops", label: "SOPs", icon: FileTextIcon },
  { href: "/mentoring", label: "Mentoring", icon: UsersIcon },
];

/** Four big targets on a phone (mock 5). The side bar has them on wider screens. */
function Shortcuts() {
  return (
    <nav aria-label="Shortcuts" className="md:hidden">
      <ul className="grid grid-cols-4 gap-2.5">
        {SHORTCUTS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-20 flex-col items-center justify-center gap-2 rounded-card bg-card text-small font-semibold transition-surface hover:bg-hover"
            >
              <Icon className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** What you opened lately: how far you got as a hint, and a tick once you marked it complete. */
async function RecentlyWatched({ userId }: { userId: string }) {
  const lessons = await getRecentlyWatched(userId);
  if (lessons.length === 0) {
    return null;
  }
  return (
    <Section id="recent-heading" title="Recently watched">
      <ul className="grid gap-x-6 lg:grid-cols-2">
        {lessons.map((lesson) => (
          <li key={lesson.key}>
            <RecentRow lesson={lesson} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RecentRow({ lesson }: { lesson: RecentLesson }) {
  return (
    <Link
      href={lesson.href}
      prefetch={false}
      style={{ "--dept": "var(--accent)" } as CSSProperties}
      className="flex items-center gap-3 rounded-button py-2 transition-surface hover:bg-hover sm:px-2"
    >
      <span className="relative shrink-0">
        <LessonThumbnail url={lesson.thumbnailUrl} minutes={lesson.minutes} className="w-24" />
        {lesson.completed ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-button bg-[color-mix(in_srgb,var(--photo-bg)_55%,transparent)] text-success"
          >
            <CheckIcon className="size-6" />
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{lesson.title}</span>
        <span className="truncate text-small text-text-muted">{lesson.courseTitle}</span>
        <span className="text-small text-text-muted">{lesson.status}</span>
      </span>
      {lesson.completed ? (
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-pill border-2 border-success text-success"
        >
          <CheckIcon className="size-4" />
        </span>
      ) : lesson.percent !== null ? (
        <WatchRing percent={lesson.percent} />
      ) : null}
    </Link>
  );
}

/** A small ring of how far into the video you got. Decorative: the words say the same. */
function WatchRing({ percent }: { percent: number }) {
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className="size-7 shrink-0 -rotate-90">
      <circle cx="14" cy="14" r={radius} fill="none" strokeWidth="2.6" stroke="var(--border)" />
      {percent > 0 ? (
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          strokeWidth="2.6"
          strokeLinecap="round"
          stroke="var(--accent)"
          strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
        />
      ) : null}
    </svg>
  );
}

function ServiceRow({
  startsAt,
  role,
  event,
  label,
  trained,
}: {
  startsAt: string;
  role: string;
  event: string;
  label: string;
  trained: boolean;
}) {
  const start = new Date(startsAt);
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex w-11 shrink-0 flex-col items-center rounded-button bg-card py-1">
        <span className="text-[0.6875rem] font-bold text-error uppercase">
          {WEEKDAY.format(start)}
        </span>
        <span className="tabular text-subheading leading-tight font-bold">
          {DAY_OF_MONTH.format(start)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{role}</span>
        <span className="truncate text-small text-text-muted">
          {event} · {TIME.format(start)}
        </span>
      </span>
      <StatusBadge tone={trained ? "success" : "pending"}>{label}</StatusBadge>
    </div>
  );
}

function PlanHeading({ id, title, count }: { id: string; title: string; count: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-heading font-bold">
        {title}
      </h2>
      <span className="text-small text-text-muted">{count}</span>
    </div>
  );
}

function PlanGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="eyebrow">{label}</p>
      {children}
    </div>
  );
}

/** The one thing to do now, as one card with its picture and a small button (mock 5). */
function NextBlock({ next }: { next: PlanNext }) {
  return (
    <div
      style={{ "--dept": "var(--accent)" } as CSSProperties}
      className="flex items-center gap-3.5 rounded-card bg-card p-3"
    >
      {next.showThumbnail ? (
        <LessonThumbnail url={next.thumbnailUrl} className="w-28 sm:w-44" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="leading-tight font-semibold sm:text-subheading">{next.title}</h3>
          <p className="text-small text-text-muted">{next.note}</p>
        </div>
        <Link
          href={next.href}
          className={buttonClasses("primary", "rounded-pill px-4 font-semibold sm:w-fit", "md")}
        >
          <PlayIcon className="size-3.5" />
          {next.button}
          <span className="sr-only">: {next.title}</span>
        </Link>
      </div>
    </div>
  );
}

const MARK_TILES: Record<PlanItem["mark"], string> = {
  A: "bg-tile-violet text-tile-violet-ink",
  S: "bg-tile-blue text-tile-blue-ink",
  P: "bg-tile-orange text-tile-orange-ink",
  C: "bg-tile-green text-tile-green-ink",
};

const ROW_CLASSES =
  "flex min-h-13 items-center gap-3 rounded-button px-3 py-1.5 transition-surface hover:bg-hover";

function PlanRow({ item }: { item: PlanItem }) {
  return (
    <Link href={item.href} className={ROW_CLASSES}>
      <span
        aria-hidden="true"
        className={`flex size-7 shrink-0 items-center justify-center rounded-pill text-small font-bold ${MARK_TILES[item.mark]}`}
      >
        {item.mark}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{item.title}</span>
        <span className="text-small text-text-muted">{item.note}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-text-muted" />
    </Link>
  );
}

/** The first steps for someone new (Design D, first day). */
function GettingStarted(props: Parameters<typeof gettingStarted>[0]) {
  const { steps, doneCount, next, later, done } = gettingStarted(props);
  return (
    <section
      aria-labelledby="getting-started-heading"
      className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-3.5 sm:p-5"
    >
      <div className="flex flex-col gap-2">
        <PlanHeading
          id="getting-started-heading"
          title="Getting started"
          count={`${doneCount} of ${steps.length} done`}
        />
        <ProgressBar
          percent={Math.round((doneCount / steps.length) * 100)}
          label="Getting started"
        />
      </div>
      {done.length > 0 ? (
        <PlanGroup label="Done">
          {done.map((step) => (
            <Link key={step.key} href={step.href} className={ROW_CLASSES}>
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-success-soft text-success"
              >
                <CheckIcon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-text-secondary">{step.title}</span>
                <span className="text-small text-text-muted">{step.note}</span>
              </span>
            </Link>
          ))}
        </PlanGroup>
      ) : null}
      {next ? (
        <PlanGroup label="Next">
          <NextBlock
            next={{
              title: next.title,
              note: next.note,
              href: next.href,
              button: next.button,
              showThumbnail: next.isCourse,
              thumbnailUrl: null,
            }}
          />
        </PlanGroup>
      ) : null}
      {later.length > 0 ? (
        <PlanGroup label="After that">
          {later.map((step) => (
            <Link key={step.key} href={step.href} className={ROW_CLASSES}>
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-hover text-small font-bold text-text-secondary"
              >
                {steps.indexOf(step) + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{step.title}</span>
                <span className="text-small text-text-muted">{step.note}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-text-muted" />
            </Link>
          ))}
        </PlanGroup>
      ) : null}
    </section>
  );
}

/**
 * Courses to try, as posters across the full width in a row that scrolls sideways, with the
 * Library a click away.
 */
async function KeepExploring({
  userId,
  categories,
  inPlan,
}: {
  userId: string;
  categories: CardData[];
  inPlan: ReadonlySet<string>;
}) {
  const courses = courseSuggestions(await getCourseLibrary(userId, categories), inPlan, 8);
  if (courses.length === 0) {
    return null;
  }
  return (
    <ScrollRail
      id="explore-heading"
      title="Keep exploring"
      aside={
        <Link
          href="/courses"
          className="text-small font-medium whitespace-nowrap text-accent-light underline-offset-4 hover:underline"
        >
          All courses
        </Link>
      }
    >
      {courses.map((course) => (
        <li key={course.id} className="w-36 sm:w-40">
          <CoursePoster course={course} showCategory />
        </li>
      ))}
    </ScrollRail>
  );
}

/** Keeps membership, completion, and approval to serve visibly separate (SPEC §3, DESIGN §10). */
function HowTrainingWorks() {
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
    <details className="group rounded-card border border-border bg-card [&_summary::-webkit-details-marker]:hidden">
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
