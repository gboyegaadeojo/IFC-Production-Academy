import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCurriculumOverview } from "@/lib/data/curriculum";
import { courseStateLabel, type CourseState } from "@/lib/domain/curriculum";
import { departmentHueVar } from "@/lib/domain/departments";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createCourseAction } from "./actions";

export const metadata: Metadata = { title: "Curriculum" };

export default function CurriculumPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the curriculum…" />}>
      <CurriculumContent />
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

async function CurriculumContent() {
  const { grants, allowed } = await getAdminAccess("curriculum");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await getCurriculumOverview(grants);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Curriculum</h1>
        <p className="max-w-2xl text-text-secondary">
          Build each level&apos;s courses. Changes stay in a draft until you publish; every publish
          is kept as a version you can go back to.
        </p>
      </header>

      {departments.map((department) => (
        <section
          key={department.id}
          aria-labelledby={`curriculum-${department.id}`}
          className="flex flex-col gap-5"
          style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
        >
          <h2
            id={`curriculum-${department.id}`}
            className="flex items-center gap-3 text-heading font-semibold"
          >
            <span className="text-[var(--dept)]">
              <DepartmentIcon icon={department.icon} />
            </span>
            {department.name}
          </h2>

          {department.levels.map((level) => (
            <div
              key={level.id}
              className="flex flex-col gap-3 rounded-card border border-border bg-card p-5"
            >
              <h3 className="text-subheading font-semibold">
                Level {level.number}: {level.name}
              </h3>
              {level.courses.length === 0 ? (
                <p className="text-small text-text-secondary">No courses yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {level.courses.map((course) => (
                    <li key={course.id}>
                      <Link
                        href={`/admin/curriculum/${course.id}`}
                        className="flex flex-col gap-2 py-3 hover:bg-hover sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="font-medium">{course.state.title}</span>
                        <StatusBadge tone={tone(course.state)}>
                          {courseStateLabel(course.state)}
                        </StatusBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {department.canDraft ? (
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center text-small font-medium text-accent-light">
                    New course
                    <span className="sr-only">
                      {" "}
                      in Level {level.number}, {department.name}
                    </span>
                  </summary>
                  <ActionForm
                    action={createCourseAction}
                    submitLabel="Create course"
                    pendingLabel="Creating…"
                    hidden={{ levelId: level.id }}
                    className="mt-2 flex max-w-md flex-col gap-3"
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
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
