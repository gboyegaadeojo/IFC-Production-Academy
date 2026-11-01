import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronRightIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCurriculumOverview, type CurriculumOverview } from "@/lib/data/curriculum";
import { courseStateLabel, type CourseState } from "@/lib/domain/curriculum";
import { departmentHueVar } from "@/lib/domain/departments";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createCourseAction } from "./actions";
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
  const departments = await getCurriculumOverview(grants);
  const params = await searchParams;
  const selected =
    departments.find((department) => department.id === params.department) ?? departments[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Curriculum"
        description="Build each level's courses. Changes stay in a draft until you publish, and every publish is kept as a version you can go back to."
      />

      {departments.length > 1 ? (
        <nav aria-label="Departments" className="flex flex-wrap gap-2">
          {departments.map((department) => {
            const current = department.id === selected?.id;
            return (
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
            );
          })}
        </nav>
      ) : null}

      {selected ? (
        <Workspace department={selected} />
      ) : (
        <EmptyState title="No departments to build for">
          You don&apos;t look after any department&apos;s curriculum yet.
        </EmptyState>
      )}
    </div>
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
      <ol className="grid gap-4 xl:grid-cols-3">
        {department.levels.map((level) => (
          <li key={level.id} className="flex">
            <article
              aria-labelledby={`level-${level.id}`}
              className="flex w-full flex-col gap-4 rounded-card border border-border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-[var(--dept)] font-mono text-small">
                  {level.number}
                </span>
                <div className="flex flex-col">
                  <span className="eyebrow">Level {level.number}</span>
                  <h3 id={`level-${level.id}`} className="font-semibold">
                    {level.name}
                  </h3>
                </div>
              </div>

              {level.courses.length === 0 ? (
                <p className="text-small text-text-secondary">
                  No courses in Level {level.number} yet.
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
                    className={`flex min-h-control w-fit cursor-pointer list-none items-center rounded-button px-3 text-small font-medium transition-surface [&::-webkit-details-marker]:hidden ${
                      level.courses.length === 0
                        ? "bg-accent text-on-accent hover:brightness-110"
                        : "border border-border-strong text-text hover:bg-hover"
                    }`}
                  >
                    Add course
                    <span className="sr-only">
                      {" "}
                      to Level {level.number}, {department.name}
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
