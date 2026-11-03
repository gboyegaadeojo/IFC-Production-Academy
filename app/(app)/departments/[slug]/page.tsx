import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  LockIcon,
} from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyReadiness, type MyReadiness } from "@/lib/data/competency";
import { getDepartmentPathway, type PathwayLevel } from "@/lib/data/pathway";
import { getCourseProgressById } from "@/lib/data/progress";
import { COMPETENCY_STATE_LABELS, competencyState, missingLabel } from "@/lib/domain/competency";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseCountLabel } from "@/lib/domain/home";
import { formatMinutes, lessonCountLabel, stepHref } from "@/lib/domain/learning";
import type { CourseProgress } from "@/lib/domain/progress";
import { MembershipStatus } from "../../home/department-card";

export const metadata: Metadata = { title: "Department" };

const SLUG = /^[a-z0-9-]{1,80}$/;

export default function DepartmentPage({ params }: PageProps<"/departments/[slug]">) {
  return (
    <Suspense fallback={<DepartmentSkeleton />}>
      <DepartmentContent params={params} />
    </Suspense>
  );
}

/**
 * Department overview and three-level pathway (DESIGN §6.3, SPEC §1 "Three-level framework";
 * department mock, approved 2026-11-02): a header with the one button that matters, the levels as
 * a path read top to bottom, then practical skills and serving, which courses never imply (SPEC §3).
 */
async function DepartmentContent({ params }: Pick<PageProps<"/departments/[slug]">, "params">) {
  const user = await requireActiveUser();
  const { slug } = await params;
  if (!SLUG.test(slug)) {
    notFound();
  }
  const pathway = await getDepartmentPathway(user.id, slug);
  if (!pathway) {
    notFound();
  }
  const { department, levels, canOpenCourses } = pathway;
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;
  const courses = levels.flatMap((level) => level.courses);
  const published = courses.length;
  const [progress, readiness] = canOpenCourses
    ? await Promise.all([
        getCourseProgressById(
          user.id,
          courses.map((course) => course.id),
        ),
        getMyReadiness(user.id, department.id),
      ])
    : [new Map<string, CourseProgress>(), null];

  const lessons = courses.reduce((total, course) => total + (course.lessonCount ?? 0), 0);
  const minutes = courses.reduce((total, course) => total + (course.estimatedMinutes ?? 0), 0);
  // The one button that matters: carry on with a course in progress, or start the first one.
  const started = courses.find((course) => progress.get(course.id)?.state === "in_progress");
  const fresh = courses.find((course) => progress.get(course.id)?.state === "not_started");
  const target = started ?? fresh;
  const targetNext = target ? progress.get(target.id)?.next : null;

  return (
    <div
      style={style}
      className="page-container flex flex-col gap-8 py-4 sm:py-8 lg:gap-10 lg:py-10"
    >
      <Link
        href="/home"
        className="-ml-1 flex min-h-touch w-fit items-center gap-1 rounded-button pr-2 pl-1 text-small font-medium text-text-secondary hover:text-text sm:hidden"
      >
        <ChevronLeftIcon className="size-4" />
        Training
      </Link>
      <div className="hidden sm:block">
        <Breadcrumbs items={[{ label: "Home", href: "/home" }, { label: department.name }]} />
      </div>

      <section
        aria-labelledby="department-heading"
        className="relative grid gap-x-5 gap-y-4 overflow-hidden rounded-card border border-border bg-surface p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-6"
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--dept)]" />
        <div className="flex items-center gap-4 sm:contents">
          <span
            aria-hidden="true"
            className="flex size-13 shrink-0 items-center justify-center rounded-card bg-[color-mix(in_srgb,var(--dept)_12%,var(--surface))] text-[var(--dept)] sm:size-16"
          >
            <DepartmentIcon icon={department.icon} className="size-7 sm:size-8" />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="eyebrow">Department</p>
            <h1 id="department-heading" className="text-title font-semibold text-balance">
              {department.name}
            </h1>
            <p className="hidden max-w-[44rem] text-text-secondary sm:block">
              {department.summary}
            </p>
            <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 text-small text-text-muted sm:flex">
              <Facts published={published} lessons={lessons} minutes={minutes} />
            </div>
          </div>
        </div>
        <p className="text-text-secondary sm:hidden">{department.summary}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-text-muted sm:hidden">
          <Facts published={published} lessons={lessons} minutes={minutes} />
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-col gap-2 sm:items-end">
            <MembershipStatus department={department} publishedCourses={published} hideOpenLink />
          </div>
          {target && targetNext && canOpenCourses ? (
            <Link
              href={stepHref(target.id, targetNext)}
              className={buttonClasses("primary", "w-full sm:w-auto")}
            >
              {started ? "Continue" : "Start learning"}
              <span className="sr-only">: {target.title}</span>
              <ArrowRightIcon className="size-4" />
            </Link>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="pathway-heading" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">Pathway</p>
          <h2 id="pathway-heading" className="text-heading font-semibold">
            Three levels, one step at a time
          </h2>
          {!canOpenCourses ? (
            <p className="flex items-center gap-2 text-small text-text-secondary">
              <LockIcon className="size-4 text-text-muted" />
              You can see what each level covers. Courses open when the department does.
            </p>
          ) : null}
        </div>
        <ol className="flex flex-col">
          {levels.map((level, index) => (
            <li key={level.id}>
              <LevelStep
                level={level}
                canOpen={canOpenCourses}
                isLast={index === levels.length - 1}
                progress={progress}
              />
            </li>
          ))}
        </ol>
      </section>

      <Readiness departmentName={department.name} readiness={readiness} />
    </div>
  );
}

function Facts({
  published,
  lessons,
  minutes,
}: {
  published: number;
  lessons: number;
  minutes: number;
}) {
  if (published === 0) {
    return <span>Three levels · no courses published yet</span>;
  }
  return (
    <>
      <span>{courseCountLabel(published)}</span>
      {lessons > 0 ? <span>{lessonCountLabel(lessons)}</span> : null}
      {minutes > 0 ? <span>About {formatMinutes(minutes)}</span> : null}
    </>
  );
}

/** One level on the path: its node and line, what it covers, and its courses as cards. */
function LevelStep({
  level,
  canOpen,
  isLast,
  progress,
}: {
  level: PathwayLevel;
  canOpen: boolean;
  isLast: boolean;
  progress: ReadonlyMap<string, CourseProgress>;
}) {
  const empty = level.courses.length === 0;
  return (
    <article
      aria-labelledby={`level-${level.id}`}
      className="relative grid grid-cols-[1.875rem_minmax(0,1fr)] gap-x-3 pb-6 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-x-4"
    >
      {isLast ? null : (
        <span
          aria-hidden="true"
          className="absolute top-9 bottom-0 left-[0.875rem] w-0.5 bg-border sm:top-10 sm:left-[1.0625rem]"
        />
      )}
      <span
        aria-hidden="true"
        className={`relative z-[1] flex size-[1.875rem] items-center justify-center rounded-pill border-2 bg-surface font-mono text-small font-semibold sm:size-9 ${
          empty ? "border-border text-text-muted" : "border-[var(--dept)] text-[var(--dept)]"
        }`}
      >
        {level.number}
      </span>
      <div className="flex min-w-0 flex-col gap-1 pt-1 sm:pt-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="sr-only">Level {level.number}: </span>
          <h3 id={`level-${level.id}`} className="font-semibold">
            {level.name}
          </h3>
          <span className="text-small text-text-muted">
            {empty ? "Coming later" : courseCountLabel(level.courses.length)}
          </span>
        </div>
        {level.summary ? (
          <p
            className={`max-w-[65ch] text-small ${empty ? "text-text-muted" : "text-text-secondary"}`}
          >
            {level.summary}
          </p>
        ) : null}
        {empty ? null : (
          <ul className="mt-3 grid gap-3 md:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
            {level.courses.map((course) => {
              const courseProgress = progress.get(course.id);
              const percent = courseProgress?.percent ?? 0;
              const meta = [
                courseProgress
                  ? `${courseProgress.countedCompleted} of ${lessonCountLabel(courseProgress.countedTotal)}`
                  : course.lessonCount !== null
                    ? lessonCountLabel(course.lessonCount)
                    : null,
                course.estimatedMinutes ? `About ${formatMinutes(course.estimatedMinutes)}` : null,
              ].filter(Boolean);
              return (
                <li key={course.id}>
                  {canOpen ? (
                    <Link
                      href={`/courses/${course.id}`}
                      className="group flex lift flex-col gap-3 rounded-card border border-border bg-card px-4 py-3.5"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex-1 font-semibold text-text transition-surface group-hover:text-accent-light group-focus-visible:text-accent-light">
                          {course.title}
                        </span>
                        <ChevronRightIcon className="size-4 shrink-0 text-text-muted transition-surface group-hover:translate-x-1 group-hover:text-accent-light group-focus-visible:translate-x-1 group-focus-visible:text-accent-light" />
                      </span>
                      {courseProgress ? (
                        <ProgressBar
                          percent={percent}
                          label={`${course.title}: ${percent}% done`}
                        />
                      ) : null}
                      <span className="flex flex-wrap justify-between gap-x-3 text-small text-text-muted">
                        {meta.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </span>
                    </Link>
                  ) : (
                    <span className="flex flex-col gap-1 rounded-card border border-dashed border-border px-4 py-3.5">
                      <span className="font-medium text-text-secondary">{course.title}</span>
                      <span className="text-small text-text-muted">Not open yet</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

/**
 * Practical skills and serving, kept apart from course progress (DESIGN §6.3, §10; SPEC §3).
 * Each competency and role shows its state as the system worked it out (SRS-COMP-001..004).
 * What isn't set up yet is said once, not under every role.
 */
function Readiness({
  departmentName,
  readiness,
}: {
  departmentName: string;
  readiness: MyReadiness | null;
}) {
  const now = new Date();
  const unconfigured = readiness
    ? readiness.roles.filter((role) => role.readiness.unconfigured).length
    : 0;
  const configured =
    readiness !== null && (readiness.competencies.length > 0 || readiness.roles.length > 0);
  const note = !configured
    ? readiness === null
      ? "Your practical skills and roles show here once the department opens."
      : `Hands-on checks and serving roles for ${departmentName} aren't set up yet.`
    : readiness.competencies.length === 0
      ? "Leaders haven't set the hands-on checks for these roles yet."
      : unconfigured > 0
        ? `Leaders haven't set what ${unconfigured === 1 ? "one role needs" : `${unconfigured} roles need`} yet.`
        : null;

  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Readiness</p>
        <h2 id="readiness-heading" className="text-heading font-semibold">
          Practical skills and serving
        </h2>
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <p className="flex items-start gap-2.5 border-b border-border bg-surface px-4 py-3 text-small text-text-secondary">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-text-muted" />
          <span>
            {note ? `${note} ` : ""}A trainer watches you work and ticks a checklist; the Academy
            works out the result. Finishing courses is recorded separately from being approved to
            serve.
          </span>
        </p>
        {configured ? (
          <div className="grid md:grid-cols-2 md:divide-x md:divide-border">
            {readiness.competencies.length > 0 ? (
              <div className="flex flex-col">
                <h3 className="px-4 pt-3 pb-1 text-small font-semibold text-text-secondary">
                  Practical skills
                </h3>
                <ul className="divide-y divide-border">
                  {readiness.competencies.map((competency) => {
                    const state = competencyState(competency.record, now);
                    return (
                      <li
                        key={competency.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">{competency.name}</span>
                          {state === "approved" && competency.record ? (
                            <span className="text-small text-text-muted">
                              Since {formatDate(competency.record.grantedAt)}
                            </span>
                          ) : null}
                        </span>
                        <StatusBadge tone={state === "approved" ? "success" : "neutral"}>
                          {COMPETENCY_STATE_LABELS[state]}
                        </StatusBadge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div
              className={`flex flex-col ${readiness.competencies.length > 0 ? "" : "md:col-span-2"}`}
            >
              <h3 className="px-4 pt-3 pb-1 text-small font-semibold text-text-secondary">
                Approved to serve
              </h3>
              {readiness.roles.length === 0 ? (
                <p className="px-4 pb-3 text-small text-text-muted">No serving roles set up yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {readiness.roles.map((role) => {
                    const detail =
                      role.readiness.approved && role.approvedAt
                        ? `Since ${formatDate(role.approvedAt)}`
                        : role.readiness.unconfigured
                          ? null
                          : missingLabel(role.readiness.missing);
                    return (
                      <li
                        key={role.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">{role.name}</span>
                          {detail ? (
                            <span className="text-small text-text-muted">{detail}</span>
                          ) : null}
                        </span>
                        <StatusBadge tone={role.readiness.approved ? "success" : "neutral"}>
                          {role.readiness.approved ? "Approved to serve" : "Not yet"}
                        </StatusBadge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DepartmentSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the department…" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-36" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    </div>
  );
}
