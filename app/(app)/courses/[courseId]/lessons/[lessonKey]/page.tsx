import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RecordView } from "@/components/lesson/record-view";
import { VideoPlayer } from "@/components/lesson/video-player";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getLearnerCourse, getLearnerLesson, canLearnIn } from "@/lib/data/pathway";
import { mediaLibraryEnabled } from "@/lib/data/media";
import { getCourseProgress } from "@/lib/data/progress";
import { getPassedPracticalKeys } from "@/lib/data/practicals";
import { getPassedQuizKeys } from "@/lib/data/quizzes";
import { getLessonResources } from "@/lib/data/sops";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseSteps, formatMinutes, lessonPosition, stepHref } from "@/lib/domain/learning";
import { progressFor } from "@/lib/domain/progress";
import { SOP_STATE_LABELS } from "@/lib/domain/sops";
import { CourseOutline } from "../../course-outline";
import { recordLessonViewAction } from "./actions";
import { CompleteToggle } from "./complete-toggle";
import { RichText } from "@/components/ui/rich-text";

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
 * Lesson view (DESIGN §6.5; lesson page mock, approved 2026-11-02). Video first, then the title
 * with Mark complete beside it; the outline sits alongside on desktop and in a panel on phones,
 * where every action lives in one bar at the bottom. Members mark the lesson complete themselves: nothing
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
    // No lessons yet, or the department isn't open: the course page explains.
    redirect(`/courses/${course.id}`);
  }
  const position = lessonPosition(course.modules, lessonKey);
  const [lesson, member, courseProgress, passed, practicalsPassed] = position
    ? await Promise.all([
        getLearnerLesson(course.versionId, lessonKey),
        canLearnIn(user.id, course.department.id),
        getCourseProgress(user.id, course.id),
        getPassedQuizKeys(user.id, [course.id]).then((byCourse) => byCourse.get(course.id)),
        getPassedPracticalKeys(user.id, [course.id]).then((byCourse) => byCourse.get(course.id)),
      ])
    : [null, false, new Map(), undefined, undefined];
  if (!position || !lesson) {
    // Not in the live version (for example removed in a newer version).
    notFound();
  }
  const progress = progressFor(courseProgress, lessonKey);
  const resources = (await getLessonResources(lesson.id)).filter(
    (resource) => resource.state !== "archived" && resource.state !== "not_published",
  );
  // The next lesson, or the quiz that follows this module.
  const steps = courseSteps(course.modules, course.quizzes, course.practicals);
  const nextStep =
    steps[steps.findIndex((step) => step.kind === "lesson" && step.key === lessonKey) + 1] ?? null;
  const record = member ? recordLessonViewAction.bind(null, course.id, lessonKey) : null;
  const moduleTitle = course.modules.find((m) => m.lessons.some((l) => l.key === lessonKey))?.title;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;

  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const doneCount = course.modules
    .flatMap((m) => m.lessons)
    .filter((l) => progressFor(courseProgress, l.key).state === "completed").length;
  const done = progress.state === "completed";
  const previousHref = position.previous
    ? `/courses/${course.id}/lessons/${position.previous.key}`
    : `/courses/${course.id}`;
  const nextHref = nextStep ? stepHref(course.id, nextStep) : `/courses/${course.id}`;
  const nextLabel = nextStep
    ? nextStep.kind === "quiz"
      ? "Next, quiz"
      : nextStep.kind === "practical"
        ? "Next, practical assessment"
        : "Up next"
    : "That's the last lesson";
  const outline = (
    <CourseOutline
      courseId={course.id}
      modules={course.modules}
      quizzes={course.quizzes}
      practicals={course.practicals}
      passedPracticalKeys={practicalsPassed}
      progress={courseProgress}
      passedQuizKeys={passed}
      currentKey={lessonKey}
      compact
    />
  );
  const doneLine = `${doneCount} of ${lessonCount} done`;

  return (
    <>
      <div
        style={style}
        className="page-container flex flex-col gap-5 pt-2 pb-8 sm:gap-6 sm:py-8 lg:py-10"
      >
        {/* Phone: one line back to the course; larger screens keep the breadcrumbs. */}
        <Link
          href={`/courses/${course.id}`}
          className="-ml-1 flex min-h-touch w-fit max-w-full items-center gap-1 rounded-button pr-2 pl-1 text-small font-medium text-text-secondary hover:text-text sm:hidden"
        >
          <ChevronLeftIcon className="size-4 shrink-0" />
          <span className="truncate">{course.title}</span>
          <span className="ml-1.5 shrink-0 font-normal text-text-muted">
            {position.index + 1} of {position.total}
          </span>
        </Link>
        <div className="hidden sm:block">
          <Breadcrumbs
            items={[
              { label: "Training", href: "/home" },
              { label: course.department.name, href: `/departments/${course.department.slug}` },
              { label: course.title, href: `/courses/${course.id}` },
              { label: lesson.title },
            ]}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
          <article aria-labelledby="lesson-heading" className="flex min-w-0 flex-col gap-5">
            {record ? <RecordView record={record} /> : null}
            {lesson.video ? (
              <div className="-mx-4 sm:mx-0">
                <VideoPlayer
                  video={lesson.video}
                  fileUrl={mediaLibraryEnabled() ? `/media/lessons/${lesson.id}` : undefined}
                  title={lesson.title}
                  startSeconds={progress.positionSeconds}
                  onPosition={record ?? undefined}
                />
              </div>
            ) : null}

            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="eyebrow">
                  Lesson {position.index + 1} of {position.total}
                  {moduleTitle ? ` · ${moduleTitle}` : ""}
                </p>
                <h1 id="lesson-heading" className="text-title font-semibold text-balance">
                  {lesson.title}
                </h1>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
                  {lesson.estimatedMinutes ? (
                    <li>About {formatMinutes(lesson.estimatedMinutes)}</li>
                  ) : null}
                  <li>{lesson.isRequired ? "Required" : "Optional"}</li>
                  {done && progress.completedAt ? (
                    <li className="font-medium text-success">
                      Completed {formatDate(progress.completedAt)}
                    </li>
                  ) : null}
                </ul>
              </div>
              {member ? (
                <CompleteToggle
                  done={done}
                  courseId={course.id}
                  lessonKey={lessonKey}
                  className="hidden shrink-0 sm:block"
                />
              ) : null}
            </header>

            <p className="text-small text-text-muted">
              {member
                ? "Mark it complete when you've worked through it. Nothing checks how much you watched."
                : "Progress isn't saved while you look after this course's training."}
            </p>

            {/* Phones and tablets: the outline opens in a panel. */}
            <div className="lg:hidden">
              <Drawer
                title="Course outline"
                triggerLabel={`, ${doneLine}`}
                side="right"
                triggerClassName="w-full justify-start gap-3 rounded-card border border-border bg-surface px-3 text-small font-medium text-text"
                trigger={
                  <>
                    <ListIcon className="size-4 shrink-0" />
                    Course outline
                    <span className="ml-auto font-normal text-text-muted">{doneLine}</span>
                  </>
                }
              >
                {outline}
              </Drawer>
            </div>

            {lesson.summary ? (
              <RichText
                source={lesson.summary}
                className="reading-width text-lead text-text-secondary"
              />
            ) : null}

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

            {lesson.body.trim() ? (
              <RichText source={lesson.body} className="reading-width text-lead text-text" />
            ) : null}

            {resources.length > 0 ? (
              <section
                aria-labelledby="lesson-resources-heading"
                className="flex reading-width flex-col gap-3"
              >
                <h2 id="lesson-resources-heading" className="text-subheading font-semibold">
                  Resources
                </h2>
                <ul className="flex flex-col gap-2">
                  {resources.map((resource) => (
                    <li key={resource.id}>
                      <Link
                        href={`/sops/${resource.sopId}`}
                        className="group flex min-h-touch lift flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-card px-4 py-3"
                      >
                        <span className="flex flex-col">
                          <span className="text-small text-text-muted">SOP</span>
                          <span className="font-medium text-text transition-surface group-hover:text-accent-light">
                            {resource.title}
                          </span>
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

            {/* Larger screens: previous and up next as cards. Phones use the bottom bar. */}
            <nav aria-label="Lessons" className="hidden gap-3 sm:flex">
              <Link
                href={previousHref}
                className="group flex max-w-[45%] min-w-0 lift items-center gap-3 rounded-card border border-border bg-card px-4 py-3"
              >
                <ArrowLeftIcon className="size-4 shrink-0 text-text-muted" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-small text-text-muted">
                    {position.previous ? "Previous" : "Course overview"}
                  </span>
                  <span className="truncate font-medium transition-surface group-hover:text-accent-light">
                    {position.previous ? position.previous.title : course.title}
                  </span>
                </span>
              </Link>
              <Link
                href={nextHref}
                className="group flex min-w-0 flex-1 lift items-center gap-3 rounded-card border border-border bg-card px-4 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-small text-text-muted">{nextLabel}</span>
                  <span className="truncate font-medium transition-surface group-hover:text-accent-light">
                    {nextStep ? nextStep.title : "Back to the course"}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-text-muted transition-surface group-hover:translate-x-1 group-hover:text-accent-light" />
              </Link>
            </nav>
          </article>

          <aside aria-label="Course outline" className="hidden lg:block">
            <div className="sticky top-6 flex max-h-[calc(100dvh-3rem)] flex-col gap-3 overflow-y-auto rounded-card border border-border bg-card p-3">
              <div className="flex flex-col gap-2 px-3 pt-1">
                <Link
                  href={`/courses/${course.id}`}
                  className="text-small font-semibold text-text underline-offset-4 hover:underline"
                >
                  {course.title}
                </Link>
                <span className="text-small text-text-muted">{doneLine}</span>
                <ProgressBar
                  percent={lessonCount === 0 ? 0 : (doneCount / lessonCount) * 100}
                  label={doneLine}
                />
              </div>
              {outline}
            </div>
          </aside>
        </div>
      </div>

      {/* Phone: every action in one bar, within thumb reach (the tab bar steps aside here). */}
      <nav
        aria-label="Lesson actions"
        className="sticky bottom-0 z-30 flex items-center gap-2 border-t border-border bg-surface px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden print:hidden"
      >
        <Link href={previousHref} className={buttonClasses("secondary", "w-11 shrink-0 px-0")}>
          <ArrowLeftIcon className="size-4" />
          <span className="sr-only">
            {position.previous ? `Previous lesson: ${position.previous.title}` : "Course overview"}
          </span>
        </Link>
        {member ? (
          <CompleteToggle
            done={done}
            courseId={course.id}
            lessonKey={lessonKey}
            className="min-w-0 flex-1"
          />
        ) : (
          <span className="flex-1" />
        )}
        <Link href={nextHref} className={buttonClasses("secondary", "shrink-0")}>
          {nextStep ? "Next" : "Done"}
          <span className="sr-only">
            {nextStep ? `: ${nextStep.title}` : ": back to the course"}
          </span>
          <ChevronRightIcon className="size-4" />
        </Link>
      </nav>
    </>
  );
}

function LessonSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the lesson…" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-96 max-w-full" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="hidden h-80 lg:block" />
      </div>
    </div>
  );
}
