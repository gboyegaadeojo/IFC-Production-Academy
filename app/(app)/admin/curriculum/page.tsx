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
          className="flex flex-col gap-3"
          style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
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

          <div className="divide-y divide-border rounded-card border border-border">
            {department.levels.map((level) => (
              <div key={level.id} className="grid gap-3 p-4 md:grid-cols-[13rem_1fr] md:gap-6">
                <div className="flex flex-col gap-0.5">
                  <span className="eyebrow">Level {level.number}</span>
                  <h3 className="font-medium">{level.name}</h3>
                </div>
                <div className="flex flex-col gap-2">
                  {level.courses.length === 0 ? (
                    <p className="text-small text-text-muted">No courses yet.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {level.courses.map((course) => (
                        <li key={course.id}>
                          <Link
                            href={`/admin/curriculum/${course.id}`}
                            className="-mx-2 flex flex-col gap-1 rounded-button px-2 py-2 hover:bg-hover sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span>{course.state.title}</span>
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
                      <summary className="flex min-h-control w-fit cursor-pointer list-none items-center text-small text-accent-light hover:underline [&::-webkit-details-marker]:hidden">
                        + New course
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
                        className="mt-1 flex max-w-md flex-col gap-3"
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
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
