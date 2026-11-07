import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  LockIcon,
  PlayIcon,
} from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import Loading from "./loading";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyReadiness, type MyReadiness } from "@/lib/data/competency";
import { getStartHereCourses } from "@/lib/data/library";
import { getDepartmentPathway } from "@/lib/data/pathway";
import { getCourseProgressById } from "@/lib/data/progress";
import { COMPETENCY_STATE_LABELS, competencyState } from "@/lib/domain/competency";
import { formatDate } from "@/lib/domain/dates";
import { lessonTally, openingLevel, roleSteps } from "@/lib/domain/department-page";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseCountLabel } from "@/lib/domain/home";
import { formatMinutes, lessonCountLabel, stepHref } from "@/lib/domain/learning";
import type { CourseProgress } from "@/lib/domain/progress";
import { MembershipStatus } from "../../home/department-card";
import { DepartmentPath, Ring, type PathLevel } from "./department-path";
import { StickyContinue } from "./sticky-continue";

export const metadata: Metadata = { title: "Department" };

const SLUG = /^[a-z0-9-]{1,80}$/;
const NEXT_STEP_ID = "department-next-step";

export default function DepartmentPage({ params }: PageProps<"/departments/[slug]">) {
  return (
    <Suspense fallback={<Loading />}>
      <DepartmentContent params={params} />
    </Suspense>
  );
}

/**
 * A department, option D (approved 2026-11-07, DESIGN §6.3): A's colour cover and next-step card,
 * with B's levels as a path and what each role still needs. Courses, practical skills and approval
 * to serve stay separate (SPEC §3): a role's checklist lists skills, never courses.
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
  const isTopic = department.kind === "topic";
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;
  const courses = levels.flatMap((level) => level.courses);
  const published = courses.length;
  const [progress, readiness] = canOpenCourses
    ? await Promise.all([
        getCourseProgressById(
          user.id,
          courses.map((course) => course.id),
        ),
        isTopic ? null : getMyReadiness(user.id, department.id),
      ])
    : [new Map<string, CourseProgress>(), null];

  const tally = lessonTally(courses, progress);
  const minutes = courses.reduce((total, course) => total + (course.estimatedMinutes ?? 0), 0);
  // The one button that matters: carry on with a course in progress, or start the first one.
  const started = courses.find((course) => progress.get(course.id)?.state === "in_progress");
  const fresh = courses.find((course) => progress.get(course.id)?.state === "not_started");
  const target = started ?? fresh ?? null;
  const targetNext = target ? progress.get(target.id)?.next : null;
  const continueHref =
    target && targetNext && canOpenCourses ? stepHref(target.id, targetNext) : null;
  const continueLabel = started ? "Continue" : "Start learning";
  const isMember = department.state.kind === "member";

  const pathLevels: PathLevel[] = levels.map((level) => {
    const levelTally = lessonTally(level.courses, progress);
    return {
      id: level.id,
      number: level.number,
      name: level.name,
      summary: level.summary,
      meta:
        level.courses.length === 0
          ? "Coming later"
          : `${courseCountLabel(level.courses.length)} · ${levelTally.done} of ${lessonCountLabel(levelTally.total)} done`,
      percent: levelTally.percent,
      courses: level.courses.map((course) => {
        const p = progress.get(course.id);
        return {
          id: course.id,
          title: course.title,
          href: `/courses/${course.id}`,
          percent: p?.percent ?? 0,
          meta: [
            p
              ? `${p.countedCompleted} of ${lessonCountLabel(p.countedTotal)}`
              : course.lessonCount !== null
                ? lessonCountLabel(course.lessonCount)
                : null,
            course.estimatedMinutes ? `About ${formatMinutes(course.estimatedMinutes)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    };
  });

  return (
    <div style={style} className="flex flex-col pb-10 lg:pb-12">
      <Cover
        name={department.name}
        summary={department.summary}
        icon={department.icon}
        isTopic={isTopic}
        facts={
          published === 0
            ? department.usesLevels
              ? "Three levels · no courses yet"
              : "No courses yet"
            : [
                courseCountLabel(published),
                tally.total > 0 ? lessonCountLabel(tally.total) : null,
                minutes > 0 ? `About ${formatMinutes(minutes)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
      />

      <div className="page-container grid gap-7 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        {/* The next step overlaps the cover: on a phone first, on a wide screen top right. */}
        <section
          id={NEXT_STEP_ID}
          aria-label="Your next step"
          className="relative -mt-14 flex flex-col gap-3.5 rounded-[1.25rem] border border-border bg-surface p-4 shadow-[0_14px_40px_rgb(0_0_0/0.10)] lg:col-start-2 lg:row-start-1 lg:-mt-28"
        >
          {target && continueHref ? (
            <>
              <div className="flex items-center gap-3">
                <Ring percent={tally.percent} size="lg" />
                <div className="flex min-w-0 flex-col">
                  <span className="eyebrow">Up next</span>
                  <span className="font-semibold">{target.title}</span>
                  <span className="text-small text-text-muted">
                    {tally.done} of {lessonCountLabel(tally.total)} here · {tally.percent}% done
                  </span>
                </div>
              </div>
              <Link
                href={continueHref}
                className={buttonClasses("primary", "w-full gap-2 rounded-pill")}
              >
                <PlayIcon className="size-3.5" />
                {continueLabel}
                <span className="sr-only">: {target.title}</span>
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Ring percent={tally.percent} size="lg" />
              <p className="text-small text-text-secondary">
                {published === 0
                  ? "Courses open here when they're published."
                  : tally.total > 0 && tally.done === tally.total
                    ? "You've done every lesson here."
                    : "Choose a course below to begin."}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 border-t border-border pt-3 empty:hidden">
            <MembershipStatus department={department} publishedCourses={published} hideOpenLink />
          </div>
          {isTopic ? null : (
            <Suspense fallback={null}>
              <BeforeYouStart userId={user.id} />
            </Suspense>
          )}
        </section>

        <section
          aria-labelledby="pathway-heading"
          className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:pt-8"
        >
          <h2 id="pathway-heading" className="text-subheading font-bold tracking-tight">
            {department.usesLevels ? "Your path" : "Courses"}
          </h2>
          {!canOpenCourses ? (
            <p className="flex items-center gap-2 text-small text-text-secondary">
              <LockIcon className="size-4 text-text-muted" />
              You can see what each level covers. Courses open when the department does.
            </p>
          ) : null}
          <DepartmentPath
            levels={pathLevels}
            initialOpen={openingLevel(levels, target?.id ?? null)}
            usesLevels={department.usesLevels}
            canOpen={canOpenCourses}
          />
        </section>

        {isTopic ? null : (
          <div className="lg:col-start-2 lg:row-start-2">
            <RoleChecklist
              departmentName={department.name}
              isMember={isMember}
              readiness={readiness}
            />
          </div>
        )}
      </div>

      {target && continueHref ? (
        <StickyContinue
          watchId={NEXT_STEP_ID}
          href={continueHref}
          title={target.title}
          label={continueLabel}
        />
      ) : null}
    </div>
  );
}

/** The department's colour as a cover: its icon, name, what it's for, and its size. */
function Cover({
  name,
  summary,
  icon,
  isTopic,
  facts,
}: {
  name: string;
  summary: string;
  icon: string;
  isTopic: boolean;
  facts: string;
}) {
  return (
    <section
      aria-labelledby="department-heading"
      className="relative overflow-hidden bg-[color-mix(in_srgb,var(--dept)_72%,var(--photo-bg))] text-on-accent"
    >
      <span
        aria-hidden="true"
        className="absolute -top-24 right-[12%] size-80 rounded-pill bg-on-accent/10"
      />
      <div className="relative page-container flex flex-col gap-6 pt-3 pb-20 sm:pt-5 lg:pb-12">
        <nav aria-label="Breadcrumb" className="text-small">
          <Link
            href="/home"
            className="-ml-1 flex min-h-touch w-fit items-center gap-1 rounded-button pr-2 pl-1 font-medium text-on-accent/85 hover:text-on-accent sm:hidden"
          >
            <ChevronLeftIcon className="size-4" />
            Training
          </Link>
          <ol className="hidden items-center gap-1.5 sm:flex">
            <li>
              <Link href="/home" className="text-on-accent/80 underline-offset-4 hover:underline">
                Training
              </Link>
            </li>
            <li aria-hidden="true" className="text-on-accent/60">
              <ChevronRightIcon className="size-3.5" />
            </li>
            <li aria-current="page">{name}</li>
          </ol>
        </nav>
        <div className="flex max-w-[44rem] flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
          <span
            aria-hidden="true"
            className="flex size-13 shrink-0 items-center justify-center rounded-card bg-on-accent/20 sm:size-16"
          >
            <DepartmentIcon icon={icon} className="size-7 sm:size-8" />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-small font-semibold tracking-wide text-on-accent/75 uppercase">
              {isTopic ? "Category" : "Department"}
            </p>
            <h1
              id="department-heading"
              className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[2.5rem]"
            >
              {name}
            </h1>
            {summary ? <p className="max-w-[60ch] text-on-accent/85">{summary}</p> : null}
            <p className="w-fit rounded-pill bg-on-accent/20 px-3 py-1 text-small font-semibold">
              {facts}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Start here courses, on every department (SRS-CUR-018). Shown, never a gate. */
async function BeforeYouStart({ userId }: { userId: string }) {
  const courses = await getStartHereCourses(userId);
  if (courses.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <h2 className="text-small font-semibold">Before you start</h2>
      <ul className="flex flex-col gap-1.5">
        {courses.map((course) => (
          <li key={course.id} className="flex flex-wrap items-center gap-2 text-small">
            <Link
              href={course.href}
              className="font-medium text-accent-light underline-offset-4 hover:underline"
            >
              {course.title}
            </Link>
            {course.state === "completed" ? (
              <StatusBadge tone="success">Finished</StatusBadge>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What each role still needs (G, 2026-11-07): each serving role as a short checklist of being a
 * member and its practical skills, so nobody wonders what "Not yet" means. Skills no role uses are
 * listed after. Each state is the system's (SRS-COMP-001..004); courses never appear here.
 */
function RoleChecklist({
  departmentName,
  isMember,
  readiness,
}: {
  departmentName: string;
  isMember: boolean;
  readiness: MyReadiness | null;
}) {
  const now = new Date();
  const roles = readiness?.roles ?? [];
  const used = new Set(roles.flatMap((role) => role.required.map((c) => c.id)));
  const otherSkills = (readiness?.competencies ?? []).filter((c) => !used.has(c.id));
  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-3">
      <h2 id="readiness-heading" className="text-subheading font-bold tracking-tight">
        What each role still needs
      </h2>
      {roles.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-3 text-small text-text-secondary">
          {readiness === null
            ? "Your serving roles show here once the department opens."
            : `Serving roles for ${departmentName} aren't set up yet.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {roles.map((role) => (
            <li
              key={role.id}
              className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-3.5"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{role.name}</span>
                <StatusBadge tone={role.readiness.approved ? "success" : "neutral"}>
                  {role.readiness.approved ? "Approved to serve" : "Not yet"}
                </StatusBadge>
              </span>
              {role.readiness.approved && role.approvedAt ? (
                <span className="text-small text-text-muted">
                  Since {formatDate(role.approvedAt)}
                </span>
              ) : null}
              <div className="flex flex-col gap-2">
                {roleSteps(role, departmentName, isMember).map((step) => (
                  <div key={step.label} className="flex items-center gap-2.5 text-small">
                    {step.done ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-success-soft text-success">
                        <CheckIcon className="size-3.5" />
                        <span className="sr-only">Done: </span>
                      </span>
                    ) : (
                      <span className="size-6 shrink-0 rounded-pill border-2 border-border-strong/50">
                        <span className="sr-only">Still to do: </span>
                      </span>
                    )}
                    <span className={step.done ? "" : "text-text-secondary"}>{step.label}</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {otherSkills.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-small font-semibold text-text-secondary">Other practical skills</h3>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {otherSkills.map((skill) => {
              const state = competencyState(skill.record, now);
              return (
                <li
                  key={skill.id}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  <span className="text-small font-medium">{skill.name}</span>
                  <StatusBadge tone={state === "approved" ? "success" : "neutral"}>
                    {COMPETENCY_STATE_LABELS[state]}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="flex items-start gap-2 text-small text-text-muted">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          A trainer watches you work and ticks a checklist; the Academy works out the result.
          Finishing courses is recorded separately from being approved to serve.
        </span>
      </p>
    </section>
  );
}
