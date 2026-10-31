import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DepartmentCover } from "@/components/department-cover";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ChevronRightIcon, LockIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getDepartmentPathway, type PathwayLevel } from "@/lib/data/pathway";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseCountLabel } from "@/lib/domain/home";
import { formatMinutes, lessonCountLabel } from "@/lib/domain/learning";
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
 * Department overview and three-level pathway (DESIGN §6.3, SPEC §1 "Three-level framework").
 * Levels show real published courses. Practical skills and approval to serve are a separate area,
 * never implied by courses (SPEC §3).
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
  const published = levels.reduce((total, level) => total + level.courses.length, 0);

  return (
    <div style={style} className="page-container flex flex-col gap-12 py-8 lg:gap-16 lg:py-12">
      <section aria-labelledby="department-heading" className="flex flex-col gap-6">
        <Breadcrumbs items={[{ label: "Home", href: "/home" }, { label: department.name }]} />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start">
          <div className="flex flex-col gap-4">
            <p className="eyebrow">Department</p>
            <h1 id="department-heading" className="text-display font-semibold text-balance">
              {department.name}
            </h1>
            <p className="max-w-[40rem] text-lead text-text-secondary">{department.summary}</p>
            <p className="text-small text-text-muted">
              Three levels ·{" "}
              {published === 0
                ? "no courses published yet"
                : `${courseCountLabel(published)} published`}
            </p>
            <div className="flex max-w-md flex-col gap-2 pt-2">
              <MembershipStatus department={department} publishedCourses={published} hideOpenLink />
            </div>
          </div>
          <div className="overflow-hidden rounded-card border border-border">
            <span aria-hidden="true" className="block h-0.5 bg-[var(--dept)]" />
            <DepartmentCover hue={department.hue} icon={department.icon} label={department.name} />
          </div>
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
              You can see what each level covers. Courses open once you&apos;re a member.
            </p>
          ) : null}
        </div>
        <ol className="grid gap-4 lg:grid-cols-3">
          {levels.map((level, index) => (
            <li key={level.id} className="flex">
              <LevelStage
                level={level}
                canOpen={canOpenCourses}
                isLast={index === levels.length - 1}
              />
            </li>
          ))}
        </ol>
      </section>

      <Readiness departmentName={department.name} />
    </div>
  );
}

function LevelStage({
  level,
  canOpen,
  isLast,
}: {
  level: PathwayLevel;
  canOpen: boolean;
  isLast: boolean;
}) {
  return (
    <article
      aria-labelledby={`level-${level.id}`}
      className="relative flex w-full flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      {/* Connects the stages on wide screens; decorative. */}
      {isLast ? null : (
        <span
          aria-hidden="true"
          className="absolute top-9 -right-4 hidden h-px w-4 bg-border-strong lg:block"
        />
      )}
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-pill border border-[var(--dept)] font-mono text-small text-text">
          {level.number}
        </span>
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Level {level.number}</span>
          <h3 id={`level-${level.id}`} className="text-subheading font-semibold">
            {level.name}
          </h3>
        </div>
      </div>
      {level.summary ? <p className="text-small text-text-secondary">{level.summary}</p> : null}
      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
        {level.courses.length === 0 ? (
          <p className="text-small text-text-muted">No courses published in this level yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {level.courses.map((course) => {
              const meta = [
                course.lessonCount !== null ? lessonCountLabel(course.lessonCount) : null,
                course.estimatedMinutes ? formatMinutes(course.estimatedMinutes) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={course.id}>
                  {canOpen ? (
                    <Link
                      href={`/courses/${course.id}`}
                      className="group -mx-2 flex items-center justify-between gap-3 rounded-button px-2 py-2 transition-surface hover:bg-hover"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium text-text">{course.title}</span>
                        {meta ? <span className="text-small text-text-muted">{meta}</span> : null}
                      </span>
                      <ChevronRightIcon className="size-4 shrink-0 text-text-muted group-hover:text-text" />
                    </Link>
                  ) : (
                    <span className="flex flex-col py-2">
                      <span className="font-medium text-text-secondary">{course.title}</span>
                      <span className="text-small text-text-muted">For members</span>
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
 * Practical assessments and competency records aren't built yet, so this states how it will work
 * instead of showing a status that doesn't exist.
 */
function Readiness({ departmentName }: { departmentName: string }) {
  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Readiness</p>
        <h2 id="readiness-heading" className="text-heading font-semibold">
          Practical skills and serving
        </h2>
        <p className="reading-width text-small text-text-secondary">
          Finishing courses isn&apos;t the same as being approved to serve. These are recorded
          separately.
        </p>
      </div>
      <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-2">
        <div className="flex flex-col gap-1.5 bg-bg p-5">
          <dt className="font-medium">Practical skills</dt>
          <dd className="text-small text-text-secondary">
            A trainer watches you work and ticks a checklist; the Academy works out the result.
            Hands-on checks for {departmentName} aren&apos;t set up yet.
          </dd>
        </div>
        <div className="flex flex-col gap-1.5 bg-bg p-5">
          <dt className="font-medium">Approved to serve</dt>
          <dd className="text-small text-text-secondary">
            Granted automatically once you&apos;ve passed every practical skill a role needs. It
            will show here when it applies to you.
          </dd>
        </div>
      </dl>
    </section>
  );
}

function DepartmentSkeleton() {
  return (
    <div className="page-container flex flex-col gap-12 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the department…" />
      <div className="grid gap-8 lg:grid-cols-[1fr_28rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-72 max-w-full" />
          <Skeleton className="h-6 w-[32rem] max-w-full" />
        </div>
        <Skeleton className="aspect-[16/9]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-64" />
        ))}
      </div>
    </div>
  );
}
