import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RecordView } from "@/components/lesson/record-view";
import { VideoPlayer } from "@/components/lesson/video-player";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getLearnerCourse, getLearnerLesson, isActiveMember } from "@/lib/data/pathway";
import { mediaLibraryEnabled } from "@/lib/data/media";
import { getCourseProgress } from "@/lib/data/progress";
import { getPassedQuizKeys } from "@/lib/data/quizzes";
import { getLessonResources } from "@/lib/data/sops";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  courseSteps,
  formatMinutes,
  lessonPosition,
  paragraphs,
  stepHref,
} from "@/lib/domain/learning";
import { progressFor } from "@/lib/domain/progress";
import { SOP_STATE_LABELS } from "@/lib/domain/sops";
import { CourseOutline } from "../../course-outline";
import { completeLessonAction, recordLessonViewAction, reopenLessonAction } from "./actions";

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
 * Lesson view (DESIGN §6.5). Video first, then the lesson's content; the outline sits alongside on
 * desktop and in a disclosure on phones. Members mark the lesson complete themselves: nothing
 * checks or claims the video was watched (SRS-LESSON-006), and completing lessons never approves
 * anyone to serve (SRS-PROG-007).
 */
async function LessonContent({ params }: Pick<Props, "params">) {
  const user = await requireActiveUser();
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
  const [lesson, member, courseProgress, passed] = position
    ? await Promise.all([
        getLearnerLesson(course.versionId, lessonKey),
        isActiveMember(user.id, course.department.id),
        getCourseProgress(user.id, course.id),
        getPassedQuizKeys(user.id, [course.id]).then((byCourse) => byCourse.get(course.id)),
      ])
    : [null, false, new Map(), undefined];
  if (!position || !lesson) {
    // Not in the live version (for example removed in a newer version).
    notFound();
  }
  const progress = progressFor(courseProgress, lessonKey);
  const resources = (await getLessonResources(lesson.id)).filter(
    (resource) => resource.state !== "archived" && resource.state !== "not_published",
  );
  // The next lesson, or the quiz that follows this module.
  const steps = courseSteps(course.modules, course.quizzes);
  const nextStep =
    steps[steps.findIndex((step) => step.kind === "lesson" && step.key === lessonKey) + 1] ?? null;
  const record = member ? recordLessonViewAction.bind(null, course.id, lessonKey) : null;
  const ids = { courseId: course.id, lessonKey };
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

          {record ? <RecordView record={record} /> : null}
          {lesson.video ? (
            <VideoPlayer
              video={lesson.video}
              fileUrl={mediaLibraryEnabled() ? `/media/lessons/${lesson.id}` : undefined}
              title={lesson.title}
              startSeconds={progress.positionSeconds}
              onPosition={record ?? undefined}
            />
          ) : null}

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
                quizzes={course.quizzes}
                progress={courseProgress}
                passedQuizKeys={passed}
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

          {resources.length > 0 ? (
            <section
              aria-labelledby="lesson-resources-heading"
              className="flex reading-width flex-col gap-3"
            >
              <h2 id="lesson-resources-heading" className="text-subheading font-semibold">
                Resources
              </h2>
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                {resources.map((resource) => (
                  <li key={resource.id}>
                    <Link
                      href={`/sops/${resource.sopId}`}
                      className="flex min-h-touch flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-card"
                    >
                      <span className="flex flex-col">
                        <span className="text-small text-text-muted">SOP</span>
                        <span className="font-medium text-text">{resource.title}</span>
                      </span>
                      <span className="text-small text-text-muted">
                        {SOP_STATE_LABELS[resource.state]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            aria-labelledby="lesson-progress-heading"
            className="flex reading-width flex-col gap-3 border-t border-border pt-6"
          >
            <h2 id="lesson-progress-heading" className="sr-only">
              Your progress
            </h2>
            {!member ? (
              <p className="text-small text-text-muted">
                Progress is saved for members of {course.department.name}. You&apos;re seeing this
                lesson as someone who looks after its training.
              </p>
            ) : progress.state === "completed" && progress.completedAt ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <CheckIcon className="size-5 text-success" />
                  You marked this lesson complete on {formatDate(progress.completedAt)}.
                </p>
                <ActionForm
                  action={reopenLessonAction}
                  submitLabel="Mark as not complete"
                  pendingLabel="Saving…"
                  variant="secondary"
                  hidden={ids}
                />
              </>
            ) : (
              <>
                <p className="text-small text-text-secondary">
                  When you&apos;ve worked through this lesson, mark it complete. It&apos;s your
                  call: nothing checks how much of the video you watched.
                </p>
                <ActionForm
                  action={completeLessonAction}
                  submitLabel="Mark lesson complete"
                  pendingLabel="Saving…"
                  hidden={ids}
                />
              </>
            )}
          </section>

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
            {nextStep ? (
              <Link
                href={stepHref(course.id, nextStep)}
                className={buttonClasses("primary", "justify-end")}
              >
                <span className="truncate">
                  <span className="sr-only">
                    {nextStep.kind === "quiz" ? "Next, quiz: " : "Next lesson: "}
                  </span>
                  {nextStep.title}
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
              quizzes={course.quizzes}
              progress={courseProgress}
              passedQuizKeys={passed}
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
