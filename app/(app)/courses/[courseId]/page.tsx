import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon, LockIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCertificateForCourse } from "@/lib/data/certificates";
import { getLearnerCourse, isActiveMember } from "@/lib/data/pathway";
import { getCourseProgress } from "@/lib/data/progress";
import { getPassedPracticalKeys } from "@/lib/data/practicals";
import { getPassedQuizKeys } from "@/lib/data/quizzes";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  courseTotals,
  flattenLessons,
  formatMinutes,
  lessonCountLabel,
  stepHref,
} from "@/lib/domain/learning";
import { courseProgress, courseProgressLabel } from "@/lib/domain/progress";
import { issueCertificateAction } from "./actions";
import { CourseOutline } from "./course-outline";

export const metadata: Metadata = { title: "Course" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  return (
    <Suspense fallback={<CourseSkeleton />}>
      <CourseContent params={params} />
    </Suspense>
  );
}

/**
 * Course landing (DESIGN §6.4): what the course covers, its real size, and where to start. Shows
 * only facts that exist: no invented instructor, rating, or duration. Members and curriculum staff
 * see the lessons; anyone else sees what the course is and how to get access (SRS-MEM-005).
 */
async function CourseContent({ params }: Pick<PageProps<"/courses/[courseId]">, "params">) {
  const user = await requireActiveUser();
  const { courseId } = await params;
  if (!UUID.test(courseId)) {
    notFound();
  }
  const course = await getLearnerCourse(courseId);
  if (!course) {
    notFound();
  }
  const totals = courseTotals(course.modules);
  const first = flattenLessons(course.modules)[0];
  const member = course.canOpen && (await isActiveMember(user.id, course.department.id));
  const [lessonProgress, passed, practicalsPassed] = member
    ? await Promise.all([
        getCourseProgress(user.id, course.id),
        getPassedQuizKeys(user.id, [course.id]).then((byCourse) => byCourse.get(course.id)),
        getPassedPracticalKeys(user.id, [course.id]).then((byCourse) => byCourse.get(course.id)),
      ])
    : [null, undefined, undefined];
  const summary = lessonProgress
    ? courseProgress(
        course.modules,
        lessonProgress,
        course.quizzes,
        passed,
        course.practicals,
        practicalsPassed,
      )
    : null;
  const certificate =
    summary?.state === "completed" ? await getMyCertificateForCourse(user.id, course.id) : null;
  const minutes = totals.estimatedMinutes ?? course.estimatedMinutes;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;
  const facts = course.canOpen
    ? [
        lessonCountLabel(totals.lessons),
        totals.optional > 0 ? `${totals.optional} optional` : null,
        course.quizzes.length === 1
          ? "1 quiz"
          : course.quizzes.length > 1
            ? `${course.quizzes.length} quizzes`
            : null,
        course.practicals.length === 1
          ? "1 practical assessment"
          : course.practicals.length > 1
            ? `${course.practicals.length} practical assessments`
            : null,
        minutes ? `About ${formatMinutes(minutes)}` : null,
        `Version ${course.versionNumber}`,
      ].filter((fact): fact is string => fact !== null)
    : [`Version ${course.versionNumber}`];

  return (
    <div style={style} className="page-container flex flex-col gap-10 py-8 lg:py-12">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/home" },
          { label: course.department.name, href: `/departments/${course.department.slug}` },
          { label: course.title },
        ]}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-4 border-l-2 border-[var(--dept)] pl-5">
            <p className="eyebrow">
              Level {course.level.number} · {course.level.name}
            </p>
            <h1 className="text-display font-semibold text-balance">{course.title}</h1>
            {course.summary ? (
              <p className="max-w-[40rem] text-lead text-text-secondary">{course.summary}</p>
            ) : null}
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
              {facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </header>

          {course.objectives.length > 0 ? (
            <section aria-labelledby="objectives-heading" className="flex flex-col gap-3">
              <h2 id="objectives-heading" className="text-heading font-semibold">
                What you&apos;ll learn
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {course.objectives.map((objective) => (
                  <li key={objective} className="flex gap-3 text-text-secondary">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-[var(--dept)]"
                    />
                    {objective}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {course.canOpen ? (
            <section aria-labelledby="outline-heading" className="flex flex-col gap-4">
              <h2 id="outline-heading" className="text-heading font-semibold">
                Lessons
              </h2>
              <CourseOutline
                courseId={course.id}
                modules={course.modules}
                quizzes={course.quizzes}
                practicals={course.practicals}
                progress={lessonProgress ?? undefined}
                passedQuizKeys={passed}
                passedPracticalKeys={practicalsPassed}
              />
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {summary && summary.state !== "not_started" ? (
            <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
              <p className="font-medium">
                {summary.state === "completed"
                  ? "You've finished this course"
                  : summary.state === "awaiting_assessment"
                    ? "Awaiting your practical assessment"
                    : "Your progress"}
              </p>
              <ProgressBar percent={summary.percent} label="Course progress" />
              <p className="text-small text-text-secondary">
                {courseProgressLabel(summary, totals.required > 0)}
              </p>
              {summary.state === "completed" ? (
                certificate && !certificate.revoked ? (
                  <Link
                    href={`/certificates/${certificate.reference}`}
                    className={buttonClasses("secondary", "w-full")}
                  >
                    View your certificate
                  </Link>
                ) : certificate ? null : (
                  <ActionForm
                    action={issueCertificateAction}
                    submitLabel="Get your certificate"
                    pendingLabel="Checking…"
                    variant="secondary"
                    hidden={{ courseId: course.id }}
                    className="flex flex-col gap-2"
                  />
                )
              ) : null}
              {summary.next ? (
                <Link
                  href={stepHref(course.id, summary.next)}
                  className={buttonClasses("primary", "w-full")}
                >
                  Continue
                  <span className="sr-only">: {summary.next.title}</span>
                  <ArrowRightIcon className="size-4" />
                </Link>
              ) : null}
            </div>
          ) : course.canOpen && first ? (
            <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
              <p className="font-medium">Ready when you are</p>
              <p className="text-small text-text-secondary">
                Start with &ldquo;{first.title}&rdquo; and work through in order. You can come back
                to any lesson.
              </p>
              <Link
                href={`/courses/${course.id}/lessons/${first.key}`}
                className={buttonClasses("primary", "w-full")}
              >
                Start the course
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
              <p className="flex items-center gap-2 font-medium">
                <LockIcon className="size-4 text-text-muted" />
                For {course.department.name} members
              </p>
              <p className="text-small text-text-secondary">
                Lessons open once you&apos;re a member of the department.
              </p>
              <Link
                href={`/departments/${course.department.slug}`}
                className={buttonClasses("secondary", "w-full")}
              >
                Go to {course.department.name}
              </Link>
            </div>
          )}
          <p className="px-1 text-small text-text-muted">
            You mark each lesson complete yourself, and quizzes are scored automatically. Finishing
            a course never approves you to serve on its own: that comes from assessments with a
            trainer.
          </p>
        </aside>
      </div>
    </div>
  );
}

function CourseSkeleton() {
  return (
    <div className="page-container flex flex-col gap-10 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the course…" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-96 max-w-full" />
          <Skeleton className="h-6 w-[32rem] max-w-full" />
          <Skeleton className="mt-6 h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
