import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getLearnerCourse, getLearnerLesson } from "@/lib/data/pathway";
import { departmentHueVar } from "@/lib/domain/departments";
import { formatMinutes, lessonPosition, paragraphs } from "@/lib/domain/learning";
import { CourseOutline } from "../../course-outline";

export const metadata: Metadata = { title: "Lesson" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/courses/[courseId]/lessons/[lessonKey]">;

export default function LessonPage({ params }: Props) {
  return (
    <Suspense fallback={<LessonSkeleton />}>
      <LessonContent params={params} />
    </Suspense>
  );
}

/**
 * Lesson view (DESIGN §6.5). The lesson's content leads; the outline sits alongside on desktop and
 * in a disclosure on phones. Video and "Mark lesson complete" arrive with the lesson player and
 * progress tracking (SPEC Phase 2); until then nothing pretends to track or verify viewing
 * (SRS-LESSON-006).
 */
async function LessonContent({ params }: Pick<Props, "params">) {
  await requireActiveUser();
  const { courseId, lessonKey } = await params;
  if (!UUID.test(courseId) || !UUID.test(lessonKey)) {
    notFound();
  }
  const course = await getLearnerCourse(courseId);
  if (!course) {
    notFound();
  }
  if (!course.canOpen) {
    // Not a member: the course page explains how to get access.
    redirect(`/courses/${course.id}`);
  }
  const position = lessonPosition(course.modules, lessonKey);
  const lesson = position ? await getLearnerLesson(course.versionId, lessonKey) : null;
  if (!position || !lesson) {
    // Not in the live version (for example removed in a newer version).
    notFound();
  }
  const moduleTitle = course.modules.find((m) => m.lessons.some((l) => l.key === lessonKey))?.title;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;
  const body = paragraphs(lesson.body);

  return (
    <div style={style} className="page-container flex flex-col gap-8 py-8 lg:py-10">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/home" },
          { label: course.department.name, href: `/departments/${course.department.slug}` },
          { label: course.title, href: `/courses/${course.id}` },
          { label: lesson.title },
        ]}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
        <article aria-labelledby="lesson-heading" className="flex min-w-0 flex-col gap-8">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">
              Lesson {position.index + 1} of {position.total}
              {moduleTitle ? ` · ${moduleTitle}` : ""}
            </p>
            <h1 id="lesson-heading" className="text-title font-semibold text-balance">
              {lesson.title}
            </h1>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
              <li>{lesson.isRequired ? "Required" : "Optional"}</li>
              {lesson.estimatedMinutes ? (
                <li>About {formatMinutes(lesson.estimatedMinutes)}</li>
              ) : null}
            </ul>
            {lesson.summary ? (
              <p className="reading-width text-lead text-text-secondary">{lesson.summary}</p>
            ) : null}
          </header>

          {/* Phone: the outline is one tap away, above the content. */}
          <details className="group rounded-card border border-border lg:hidden">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
              <span className="text-small font-medium">
                Course outline · {position.index + 1} of {position.total}
              </span>
              <ChevronDownIcon className="size-4 transition-surface group-open:rotate-180" />
            </summary>
            <div className="border-t border-border p-2">
              <CourseOutline
                courseId={course.id}
                modules={course.modules}
                currentKey={lessonKey}
                compact
              />
            </div>
          </details>

          {lesson.objectives.length > 0 ? (
            <section
              aria-labelledby="lesson-objectives"
              className="flex reading-width flex-col gap-2 rounded-card border border-border bg-card p-5"
            >
              <h2 id="lesson-objectives" className="font-medium">
                By the end of this lesson
              </h2>
              <ul className="flex flex-col gap-1.5">
                {lesson.objectives.map((objective) => (
                  <li key={objective} className="flex gap-3 text-small text-text-secondary">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-pill bg-[var(--dept)]"
                    />
                    {objective}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex reading-width flex-col gap-4 text-lead text-text">
            {body.length > 0 ? (
              body.map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-text-secondary">This lesson doesn&apos;t have any text yet.</p>
            )}
          </div>

          <p className="reading-width border-t border-border pt-4 text-small text-text-muted">
            Marking lessons complete isn&apos;t switched on yet, so your place isn&apos;t saved.
          </p>

          <nav aria-label="Lessons" className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            {position.previous ? (
              <Link
                href={`/courses/${course.id}/lessons/${position.previous.key}`}
                className={buttonClasses("secondary", "justify-start")}
              >
                <ArrowLeftIcon className="size-4" />
                <span className="truncate">
                  <span className="sr-only">Previous lesson: </span>
                  {position.previous.title}
                </span>
              </Link>
            ) : (
              <Link
                href={`/courses/${course.id}`}
                className={buttonClasses("secondary", "justify-start")}
              >
                <ArrowLeftIcon className="size-4" />
                Course overview
              </Link>
            )}
            {position.next ? (
              <Link
                href={`/courses/${course.id}/lessons/${position.next.key}`}
                className={buttonClasses("primary", "justify-end")}
              >
                <span className="truncate">
                  <span className="sr-only">Next lesson: </span>
                  {position.next.title}
                </span>
                <ArrowRightIcon className="size-4" />
              </Link>
            ) : (
              <Link
                href={`/courses/${course.id}`}
                className={buttonClasses("primary", "justify-end")}
              >
                Back to the course
                <ArrowRightIcon className="size-4" />
              </Link>
            )}
          </nav>
        </article>

        <aside aria-label="Course outline" className="hidden lg:block">
          <div className="sticky top-24 flex max-h-[calc(100dvh-7rem)] flex-col gap-3 overflow-y-auto rounded-card border border-border p-3">
            <Link
              href={`/courses/${course.id}`}
              className="rounded-button px-3 pt-1 text-small font-medium text-text underline-offset-4 hover:underline"
            >
              {course.title}
            </Link>
            <CourseOutline
              courseId={course.id}
              modules={course.modules}
              currentKey={lessonKey}
              compact
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function LessonSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the lesson…" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-96 max-w-full" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="hidden h-80 lg:block" />
      </div>
    </div>
  );
}
