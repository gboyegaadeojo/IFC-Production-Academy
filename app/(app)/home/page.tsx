import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InstallApp } from "@/components/pwa/install-app";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, PlayIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyAchievements } from "@/lib/data/achievements";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyAssignedCourses } from "@/lib/data/course-assignments";
import { listDepartmentCards, type DepartmentCard as CardData } from "@/lib/data/departments";
import { getDepartmentLearning } from "@/lib/data/learning";
import { getCourseLibrary, getStartHereCourses } from "@/lib/data/library";
import { getMyOnboarding, getOpenDepartments } from "@/lib/data/onboarding";
import { getContinueLearning } from "@/lib/data/progress";
import { getMyUpcomingAssignments } from "@/lib/data/schedule";
import {
  comingUp,
  courseSuggestions,
  gettingStarted,
  type PlanItem,
  type PlanNext,
} from "@/lib/domain/coming-up";
import { departmentHueVar } from "@/lib/domain/departments";
import { homeState } from "@/lib/domain/home";
import { courseFacts } from "@/lib/domain/library";
import { volunteerPathways } from "@/lib/domain/onboarding";
import { greetingName } from "@/lib/domain/people";
import { LessonThumbnail } from "@/app/(app)/courses/[courseId]/(summary)/lesson-panel";
import { ExploreRow, MemberDepartmentCard } from "./department-card";
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
 * Training, the learner home (DESIGN §6.1; Home Page mock, Design D, approved 2026-11-05). A plan to
 * work down, with departments and a few courses to try beside it. Someone returning sees Coming up,
 * and someone new sees Getting started.
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
  const plan = comingUp({
    continuing: planContinuing,
    assigned,
    startHere,
    servings: assignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      startsAt: assignment.event.startsAt,
      endsAt: assignment.event.endsAt,
      roleName: assignment.roleName,
    })),
    now: new Date(),
  });
  const newcomer =
    state !== "member" &&
    planContinuing.length === 0 &&
    assigned.length === 0 &&
    plan.thisWeek.length === 0;
  const inPlan = new Set([
    ...planContinuing.map((item) => item.courseId),
    ...assigned.map((course) => course.id),
    ...startHere.map((course) => course.id),
  ]);

  return (
    <div className="page-container flex flex-col gap-5 py-5 sm:py-8 lg:pb-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.375rem] leading-tight font-bold tracking-tight text-balance sm:text-[1.75rem]">
          {state === "member" ? "Welcome back" : "Welcome"}
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {onboarding.map((pathway) => (
            <NextSteps key={pathway.entryId} pathway={pathway} departments={openDepartments} />
          ))}
          {newcomer ? (
            <GettingStarted
              hasName={name !== null}
              department={state === "pending" ? "requested" : "none"}
              startHere={startHere}
            />
          ) : (
            <section
              aria-labelledby="coming-up-heading"
              className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-3.5 sm:p-5"
            >
              <PlanHeading
                id="coming-up-heading"
                title="Coming up"
                count={countLabel(
                  (plan.next ? 1 : 0) + plan.thisWeek.length + plan.whenReady.length,
                )}
              />
              {plan.next ? (
                <PlanGroup label="Next">
                  <NextBlock next={plan.next} />
                </PlanGroup>
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
              {plan.thisWeek.length > 0 ? (
                <PlanGroup label="This week">
                  {plan.thisWeek.map((item) => (
                    <PlanRow key={item.key} item={item} />
                  ))}
                </PlanGroup>
              ) : null}
              {plan.whenReady.length > 0 ? (
                <PlanGroup label="When you're ready">
                  {plan.whenReady.map((item) => (
                    <PlanRow key={item.key} item={item} />
                  ))}
                </PlanGroup>
              ) : null}
            </section>
          )}
          {newcomer ? null : <InstallApp variant="banner" />}
          <HowTrainingWorks />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div id="departments" className="flex scroll-mt-20 flex-col gap-4">
            {memberOf.length > 0 ? (
              <DepartmentList id="my-departments-heading" title="Your departments">
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
              </DepartmentList>
            ) : null}
            {departments.length === 0 ? (
              <EmptyState title="No departments are open yet">
                The production team is setting up its training. Check back soon, or ask a leader
                when your department opens.
              </EmptyState>
            ) : others.length > 0 ? (
              <DepartmentList
                id="departments-heading"
                title={memberOf.length > 0 ? "Other departments" : "Choose a department"}
              >
                {others.map((department) => (
                  <li key={department.id}>
                    <ExploreRow department={department} />
                  </li>
                ))}
              </DepartmentList>
            ) : null}
          </div>
          {/* These load after the rest, so the next step never waits for them. */}
          <Suspense fallback={<Skeleton className="h-56" />}>
            <KeepExploring userId={user.id} categories={categories} inPlan={inPlan} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function countLabel(count: number): string {
  return count === 1 ? "1 thing" : `${count} things`;
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

/** The one thing to do now, opened out with its picture and button. */
function NextBlock({ next }: { next: PlanNext }) {
  return (
    <div
      style={{ "--dept": "var(--accent)" } as CSSProperties}
      className="flex flex-col gap-4 rounded-card bg-hover p-3 sm:flex-row"
    >
      {next.showThumbnail ? (
        <LessonThumbnail url={next.thumbnailUrl} className="w-full sm:w-60" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <h3 className="text-subheading leading-tight font-bold">{next.title}</h3>
        <p className="text-text-secondary">{next.note}</p>
        <Link
          href={next.href}
          className={buttonClasses("primary", "mt-1.5 min-h-touch px-4.5 font-semibold sm:w-fit")}
        >
          <PlayIcon className="size-4" />
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

function DepartmentList({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4"
    >
      <h2 id={id} className="mb-1 text-subheading font-bold">
        {title}
      </h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/** A few courses to try, with the Library a click away (Design D). */
async function KeepExploring({
  userId,
  categories,
  inPlan,
}: {
  userId: string;
  categories: CardData[];
  inPlan: ReadonlySet<string>;
}) {
  const courses = courseSuggestions(await getCourseLibrary(userId, categories), inPlan);
  return (
    <section
      aria-labelledby="explore-heading"
      className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4"
    >
      <h2 id="explore-heading" className="mb-1 text-subheading font-bold">
        Keep exploring
      </h2>
      <ul className="flex flex-col">
        {courses.map((course) => {
          const style = { "--dept": departmentHueVar(course.category.hue) } as CSSProperties;
          return (
            <li key={course.id}>
              <Link
                href={course.href}
                prefetch={false}
                className="flex min-h-13 items-center gap-2.5"
              >
                <span
                  style={style}
                  className="aspect-[3/4] w-8 shrink-0 overflow-hidden rounded-button bg-[color-mix(in_srgb,var(--dept)_35%,var(--surface))]"
                >
                  {course.coverUrl ? (
                    // Covers are public files with no image service on this plan, so a plain image is right.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.coverUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{course.title}</span>
                  <span className="text-small text-text-muted">{courseFacts(course)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-4">
        <Link
          href="/courses"
          className="flex min-h-touch items-center font-medium text-accent-light underline-offset-4 hover:underline"
        >
          All courses
        </Link>
        <Link
          href="/explore"
          className="flex min-h-touch items-center font-medium text-accent-light underline-offset-4 hover:underline"
        >
          Explore
        </Link>
      </div>
    </section>
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
