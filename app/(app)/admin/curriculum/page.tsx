import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { ActionForm, Field, IconActionForm, SwitchForm } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCurriculumOverview, type CurriculumOverview } from "@/lib/data/curriculum";
import { courseStateLabel, type CourseState } from "@/lib/domain/curriculum";
import { departmentHueVar } from "@/lib/domain/departments";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createCourseAction, moveCourseAction, setCourseStartHereAction } from "./actions";
import { CourseRowMenu } from "./course-row-menu";

export const metadata: Metadata = { title: "Curriculum" };

export default function CurriculumPage({ searchParams }: PageProps<"/admin/curriculum">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the curriculum…" />}>
      <CurriculumContent searchParams={searchParams} />
    </Suspense>
  );
}

function tone(state: CourseState) {
  if (state.kind === "archived") {
    return "neutral" as const;
  }
  if (state.kind === "unpublished" || state.draftId) {
    return "pending" as const;
  }
  return "success" as const;
}

/**
 * Curriculum workspace (DESIGN §7.4): one department at a time, its three levels side by side.
 * Drafting and publishing rules are unchanged (SRS-CUR-001..008); the course editor enforces them.
 */
async function CurriculumContent({
  searchParams,
}: Pick<PageProps<"/admin/curriculum">, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("curriculum");
  if (!allowed) {
    return <AccessDenied />;
  }
  const overview = await getCurriculumOverview(grants);
  // General categories come first, set apart from the departments (decision 2026-11-04).
  const topics = overview.filter((category) => category.kind === "topic");
  const teams = overview.filter((category) => category.kind === "team");
  const departments = [...topics, ...teams];
  const params = await searchParams;
  const selected =
    departments.find((department) => department.id === params.department) ?? departments[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Curriculum"
        description="Build each course. Changes stay in a draft until you publish, and every publish is kept as a version you can go back to."
      />

      {departments.length > 1 ? (
        <nav aria-label="Categories and departments" className="flex flex-wrap items-center gap-2">
          {departments.map((department, index) => {
            const current = department.id === selected?.id;
            const firstTeam = index > 0 && department.id === teams[0]?.id;
            return (
              <Fragment key={department.id}>
                {firstTeam ? (
                  <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />
                ) : null}
                <Link
                  key={department.id}
                  href={`/admin/curriculum?department=${department.id}`}
                  aria-current={current ? "page" : undefined}
                  style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
                  className={`inline-flex min-h-control items-center gap-2 rounded-pill border px-3 text-small transition-surface ${
                    current
                      ? "border-accent-light bg-hover font-medium text-text"
                      : "border-border text-text-secondary hover:border-border-strong hover:text-text"
                  }`}
                >
                  <span className="text-[var(--dept)]">
                    <DepartmentIcon icon={department.icon} className="size-4" />
                  </span>
                  {department.name}
                </Link>
              </Fragment>
            );
          })}
        </nav>
      ) : null}

      {selected ? (
        selected.usesLevels ? (
          <Workspace department={selected} />
        ) : (
          <CourseList category={selected} />
        )
      ) : (
        <EmptyState title="Nothing to build for yet">
          You don&apos;t look after any department&apos;s curriculum yet.
        </EmptyState>
      )}
    </div>
  );
}

/** A category without levels: one ordered list (Course Hierarchy mock, approved 2026-11-04). */
function CourseList({ category }: { category: CurriculumOverview[number] }) {
  const style = { "--dept": departmentHueVar(category.hue) } as CSSProperties;
  const level = category.levels[0];
  const courses = level?.courses ?? [];
  return (
    <section
      aria-labelledby={`curriculum-${category.id}`}
      style={style}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-button border border-[color-mix(in_srgb,var(--dept)_18%,var(--border))] bg-[color-mix(in_srgb,var(--dept)_11%,var(--surface))] text-[var(--dept)]"
        >
          <DepartmentIcon icon={category.icon} className="size-4" />
        </span>
        <div className="flex flex-col">
          <h2 id={`curriculum-${category.id}`} className="text-heading font-semibold">
            {category.name}
          </h2>
          <p className="text-small text-text-secondary">
            Courses for the whole production team, with no levels and nothing to join. Published by
            Production Directors.
          </p>
        </div>
      </div>
      {courses.length === 0 ? (
        <p className="text-small text-text-secondary">
          No courses yet.{category.canDraft ? " Add the first one below." : ""}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {courses.map((course, index) => (
            <li
              key={course.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 px-3.5 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
            >
              <div className="flex gap-0.5">
                {category.canDraft ? (
                  <>
                    <MoveButton
                      courseId={course.id}
                      title={course.state.title}
                      direction="up"
                      disabled={index === 0}
                    />
                    <MoveButton
                      courseId={course.id}
                      title={course.state.title}
                      direction="down"
                      disabled={index === courses.length - 1}
                    />
                  </>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{course.state.title}</span>
                  <StatusBadge tone={tone(course.state)}>
                    {courseStateLabel(course.state)}
                  </StatusBadge>
                </span>
                {course.facts ? (
                  <span className="text-small text-text-muted">{course.facts}</span>
                ) : null}
              </div>
              {category.canPublish ? (
                <div className="col-span-2 md:col-span-1">
                  <SwitchForm
                    action={setCourseStartHereAction}
                    hidden={{ courseId: course.id }}
                    name="on"
                    checked={course.startHere}
                    label="Start here"
                  />
                </div>
              ) : (
                <span className="hidden md:block" />
              )}
              <div className="col-span-2 flex items-center gap-1.5 md:col-span-1">
                {category.canPublish &&
                (course.state.kind === "unpublished" || course.state.draftId) ? (
                  <Link
                    href={`/admin/curriculum/${course.id}?tab=publish`}
                    className={buttonClasses("secondary", "", "sm")}
                  >
                    Publish<span className="sr-only"> {course.state.title}</span>
                  </Link>
                ) : null}
                <Link
                  href={`/admin/curriculum/${course.id}`}
                  className={buttonClasses("secondary", "", "sm")}
                >
                  Edit<span className="sr-only"> {course.state.title}</span>
                </Link>
                {course.state.kind === "unpublished" && category.canDraft ? (
                  <CourseRowMenu courseId={course.id} title={course.state.title} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {category.canDraft && level ? (
        <details className="max-w-xl">
          <summary
            className={`${buttonClasses("primary", "w-fit")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            + Add a course
          </summary>
          <ActionForm
            action={createCourseAction}
            submitLabel="Create course"
            pendingLabel="Creating…"
            hidden={{ levelId: level.id }}
            className="mt-3 flex flex-col gap-3"
          >
            <Field id={`new-course-${level.id}`} label="Course title">
              <input
                id={`new-course-${level.id}`}
                name="title"
                required
                maxLength={120}
                className={fieldClasses}
              />
            </Field>
          </ActionForm>
        </details>
      ) : null}
      {category.canPublish ? (
        <p className="text-small text-text-muted">
          Start here puts the course at the top of Training for anyone who hasn&apos;t finished it,
          and on each department&apos;s page.
        </p>
      ) : null}
    </section>
  );
}

function MoveButton({
  courseId,
  title,
  direction,
  disabled,
}: {
  courseId: string;
  title: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <IconActionForm
      action={moveCourseAction}
      hidden={{ courseId, direction }}
      disabled={disabled}
      label={`Move ${title} ${direction}`}
      icon={<ChevronDownIcon className={`size-4 ${direction === "up" ? "rotate-180" : ""}`} />}
    />
  );
}

function Workspace({ department }: { department: CurriculumOverview[number] }) {
  const style = { "--dept": departmentHueVar(department.hue) } as CSSProperties;
  return (
    <section
      aria-labelledby={`curriculum-${department.id}`}
      style={style}
      className="flex flex-col gap-4"
    >
      <h2
        id={`curriculum-${department.id}`}
        className="flex items-center gap-2.5 text-heading font-semibold"
      >
        <span className="text-[var(--dept)]">
          <DepartmentIcon icon={department.icon} className="size-5" />
        </span>
        {department.name}
      </h2>
      {department.kind === "topic" ? (
        <p className="max-w-[44rem] text-small text-text-secondary">
          Courses only, for anyone on the production team. Nobody joins, and it has no practicals or
          positions. Published by Production Directors.
        </p>
      ) : null}
      <ol className={`grid gap-4 ${department.usesLevels ? "xl:grid-cols-3" : ""}`}>
        {department.levels.map((level) => (
          <li key={level.id} className="flex">
            <article
              aria-labelledby={`level-${level.id}`}
              className="flex w-full flex-col gap-4 rounded-card border border-border bg-card p-4"
            >
              {department.usesLevels ? (
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-[var(--dept)] text-small">
                    {level.number}
                  </span>
                  <div className="flex flex-col">
                    <span className="eyebrow">Level {level.number}</span>
                    <h3 id={`level-${level.id}`} className="font-semibold">
                      {level.name}
                    </h3>
                  </div>
                </div>
              ) : (
                <h3 id={`level-${level.id}`} className="font-semibold">
                  Courses
                </h3>
              )}

              {level.courses.length === 0 ? (
                <p className="text-small text-text-secondary">
                  No courses {department.usesLevels ? `in Level ${level.number} ` : ""}yet.
                  {department.canDraft ? " Add the first one below." : ""}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border border-y border-border">
                  {level.courses.map((course) => (
                    <li key={course.id} className="flex items-center gap-1">
                      <Link
                        href={`/admin/curriculum/${course.id}`}
                        className="group flex flex-1 items-center gap-3 py-3 transition-surface hover:bg-hover"
                      >
                        <span className="flex flex-1 flex-col gap-1.5 px-1">
                          <span className="font-medium text-text">{course.state.title}</span>
                          <StatusBadge tone={tone(course.state)}>
                            {courseStateLabel(course.state)}
                          </StatusBadge>
                        </span>
                        {course.state.kind === "unpublished" && department.canDraft ? null : (
                          <ChevronRightIcon className="size-4 shrink-0 text-text-muted group-hover:text-text" />
                        )}
                      </Link>
                      {/* Only never-published courses can be deleted; the database checks too. */}
                      {course.state.kind === "unpublished" && department.canDraft ? (
                        <CourseRowMenu courseId={course.id} title={course.state.title} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {department.canDraft ? (
                <details className="mt-auto">
                  <summary
                    className={`flex min-h-control w-fit cursor-pointer list-none items-center rounded-button px-3 text-small font-medium transition-surface [&::-webkit-details-marker]:hidden ${"border border-border-strong text-text hover:bg-hover"}`}
                  >
                    Add course
                    <span className="sr-only">
                      {" "}
                      {department.usesLevels ? `to Level ${level.number}, ` : "to "}
                      {department.name}
                    </span>
                  </summary>
                  <ActionForm
                    action={createCourseAction}
                    submitLabel="Create course"
                    pendingLabel="Creating…"
                    hidden={{ levelId: level.id }}
                    className="mt-3 flex flex-col gap-3"
                  >
                    <Field id={`new-course-${level.id}`} label="Course title">
                      <input
                        id={`new-course-${level.id}`}
                        name="title"
                        required
                        maxLength={120}
                        className={fieldClasses}
                      />
                    </Field>
                  </ActionForm>
                </details>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
