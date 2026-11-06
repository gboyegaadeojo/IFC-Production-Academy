import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buttonClasses } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  ClockIcon,
  LockIcon,
  PlayCircleIcon,
  PlayIcon,
  QuizIcon,
  UserCheckIcon,
} from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import Loading from "./loading";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCertificateForCourse } from "@/lib/data/certificates";
import { getLearnerCourse, canLearnIn } from "@/lib/data/pathway";
import { getCourseProgress } from "@/lib/data/progress";
import { getPassedPracticalKeys } from "@/lib/data/practicals";
import { getMyCourseAttempts, getPassedQuizKeys, getVersionQuizzes } from "@/lib/data/quizzes";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  courseTotals,
  flattenLessons,
  formatMinutes,
  lessonCountLabel,
  stepHref,
} from "@/lib/domain/learning";
import { courseProgress, courseProgressLabel } from "@/lib/domain/progress";
import { issueCertificateAction, restartCourseAction } from "../actions";
import { CourseActions } from "./course-actions";
import { CourseTabs } from "./course-tabs";
import { LessonPanel, LessonThumbnail } from "./lesson-panel";
import { RichText } from "@/components/ui/rich-text";
import { getCourseTopics } from "@/lib/data/topics";

export const metadata: Metadata = { title: "Course" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <CourseContent params={params} />
    </Suspense>
  );
}

/**
 * The course page (DESIGN §6.4; Course Page mock, approved 2026-11-05): the cover, title, and main
 * button first, then About and Quiz results beside the lessons. Shows only facts that exist: no
 * invented instructor, rating, or duration. Anyone signed in can open the lessons of an open
 * department (decision 2026-11-01, open training).
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
  const lessons = flattenLessons(course.modules);
  const first = lessons[0];
  const member = course.canOpen && (await canLearnIn(user.id, course.department.id));
  const [lessonProgress, passed, practicalsPassed, attempts, versionQuizzes] = member
    ? await Promise.all([
        getCourseProgress(user.id, course.id),
        getPassedQuizKeys(user.id, [course.id]).then((byCourse) => byCourse.get(course.id)),
        getPassedPracticalKeys(user.id, [course.id]).then((byCourse) => byCourse.get(course.id)),
        getMyCourseAttempts(user.id, course.id),
        getVersionQuizzes(course.versionId),
      ])
    : [null, undefined, undefined, [], []];
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
  // Starting over keeps a certificate, so it's looked up whatever the progress says.
  const [certificate, topics] = await Promise.all([
    summary ? getMyCertificateForCourse(user.id, course.id) : null,
    getCourseTopics(course.id),
  ]);
  const minutes = totals.estimatedMinutes ?? course.estimatedMinutes;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;
  const started = summary !== null && summary.state !== "not_started";
  const eyebrow = course.department.uses_levels
    ? `${course.department.name} · Level ${course.level.number}`
    : course.department.name;
  const questionCounts = new Map(versionQuizzes.map((quiz) => [quiz.key, quiz.questionCount]));
  const nextLesson = lessons.find((lesson) => lesson.key === summary?.next?.key);
  const liveCertificate = certificate && !certificate.revoked ? certificate : null;

  // The card above the lessons: the next step, the first lesson, or nothing while a practical waits.
  const card =
    started && summary?.next
      ? {
          label: "Continue",
          title: summary.next.title,
          href: stepHref(course.id, summary.next),
          thumbnail: nextLesson?.thumbnailUrl,
        }
      : !first
        ? null
        : !started
          ? course.canOpen
            ? {
                label: "Start here",
                title: first.title,
                href: `/courses/${course.id}/lessons/${first.key}`,
                thumbnail: first.thumbnailUrl,
              }
            : null
          : summary?.state === "completed"
            ? {
                label: "Watch again",
                title: first.title,
                href: `/courses/${course.id}/lessons/${first.key}`,
                thumbnail: first.thumbnailUrl,
              }
            : null;

  return (
    <div
      style={style}
      className="page-container flex flex-col gap-4 py-2 sm:gap-5 sm:py-4 xl:pb-12"
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/courses"
          className="-ml-1 flex min-h-touch items-center gap-1 rounded-button pr-2 pl-1 font-medium text-accent-light"
        >
          <ChevronLeftIcon className="size-4" />
          Courses
        </Link>
        <CourseActions>
          {started ? (
            <StartOver
              courseId={course.id}
              title={course.title}
              hasCertificate={Boolean(certificate)}
            />
          ) : null}
          <Link href={`/departments/${course.department.slug}`}>
            Go to {course.department.name}
          </Link>
        </CourseActions>
      </div>

      <section className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-x-4 gap-y-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-8 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-x-12 xl:gap-y-5 xl:border-b xl:border-border xl:pb-14">
        <div className="aspect-[3/4] self-start overflow-hidden rounded-card border border-[color-mix(in_srgb,var(--dept)_35%,var(--border))] xl:row-span-2">
          {course.coverUrl ? (
            // Covers are public files with no image service on this plan, so a plain image is right.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={course.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col justify-between bg-[linear-gradient(165deg,color-mix(in_srgb,var(--dept)_30%,var(--surface)),color-mix(in_srgb,var(--dept)_7%,var(--surface)))] p-2.5 xl:p-4.5">
              <span aria-hidden="true" className="text-[var(--dept)]">
                <DepartmentIcon icon={course.department.icon} className="size-5 xl:size-6" />
              </span>
              <span
                aria-hidden="true"
                className="text-[0.9375rem] leading-tight font-bold text-balance break-words xl:text-[1.875rem]"
              >
                {course.title}
              </span>
            </div>
          )}
        </div>
        <header className="flex min-w-0 flex-col gap-2.5 xl:gap-3.5 xl:self-end">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="max-w-[13em] text-[1.375rem] leading-tight font-bold tracking-tight text-balance xl:text-[2.375rem]">
            {course.title}
          </h1>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 font-medium text-text-secondary">
            {course.canOpen ? (
              <>
                <Fact icon={<PlayCircleIcon className="size-4" />}>
                  {lessonCountLabel(totals.lessons)}
                </Fact>
                {totals.optional > 0 ? <li>{totals.optional} optional</li> : null}
                {minutes ? (
                  <Fact icon={<ClockIcon className="size-4" />}>
                    About {formatMinutes(minutes)}
                  </Fact>
                ) : null}
                {course.quizzes.length > 0 ? (
                  <Fact icon={<QuizIcon className="size-4" />}>
                    {course.quizzes.length === 1 ? "1 quiz" : `${course.quizzes.length} quizzes`}
                  </Fact>
                ) : null}
                {course.practicals.length > 0 ? (
                  <Fact icon={<UserCheckIcon className="size-4" />}>
                    {course.practicals.length === 1
                      ? "1 practical"
                      : `${course.practicals.length} practicals`}
                  </Fact>
                ) : null}
              </>
            ) : null}
            {topics.map((topic) => (
              <li key={topic.id}>
                <Link
                  href={`/explore?topic=${topic.id}`}
                  prefetch={false}
                  className="text-accent-light underline-offset-4 hover:underline"
                >
                  {topic.name}
                </Link>
              </li>
            ))}
          </ul>
        </header>
        <div className="col-span-2 flex flex-col gap-2 xl:col-span-1 xl:col-start-2 xl:items-start xl:self-start">
          {started && summary?.next ? (
            <Link
              href={stepHref(course.id, summary.next)}
              className={buttonClasses("primary", "w-fit rounded-pill px-5 font-semibold")}
            >
              <PlayIcon className="size-3.5" />
              Continue
              <span className="sr-only">: {summary.next.title}</span>
            </Link>
          ) : summary?.state === "completed" ? (
            liveCertificate ? (
              <Link
                href={`/certificates/${liveCertificate.reference}`}
                className={buttonClasses("primary", "w-fit rounded-pill px-5 font-semibold")}
              >
                View your certificate
              </Link>
            ) : certificate ? null : (
              <ActionForm
                action={issueCertificateAction}
                submitLabel="Get your certificate"
                pendingLabel="Checking…"
                hidden={{ courseId: course.id }}
                className="flex flex-col gap-2"
              />
            )
          ) : !started && course.canOpen && first ? (
            <Link
              href={`/courses/${course.id}/lessons/${first.key}`}
              className={buttonClasses("primary", "w-fit rounded-pill px-5 font-semibold")}
            >
              <PlayIcon className="size-3.5" />
              Start the course
            </Link>
          ) : !course.canOpen ? (
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 font-medium">
                <LockIcon className="size-4 text-text-muted" />
                Not open yet
              </p>
              <p className="text-small text-text-secondary">
                This course has no lessons yet, or its department isn&apos;t open. Check back soon.
              </p>
            </div>
          ) : null}
          {liveCertificate && summary?.state !== "completed" ? (
            <Link
              href={`/certificates/${liveCertificate.reference}`}
              className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
            >
              You still have your certificate
            </Link>
          ) : null}
        </div>
      </section>

      {/* Phones and smaller windows: the lessons first, then About. Wide: side by side, with the
          panel rising over the line under the cover. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26.25rem] xl:gap-x-12">
        {course.canOpen ? (
          <aside className="relative flex min-w-0 flex-col gap-3 xl:col-start-2 xl:row-start-1 xl:-mt-26">
            {card ? (
              <Link
                href={card.href}
                className="flex items-center gap-3.5 rounded-card border border-border bg-surface p-2 transition-surface hover:bg-hover"
              >
                <LessonThumbnail url={card.thumbnail} className="w-28" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{card.label}</span>
                  <span className="text-text-secondary">{card.title}</span>
                </span>
              </Link>
            ) : null}
            <LessonPanel
              courseId={course.id}
              modules={course.modules}
              quizzes={course.quizzes}
              practicals={course.practicals}
              questionCounts={questionCounts}
              progress={lessonProgress ?? undefined}
              passedQuizKeys={passed}
              passedPracticalKeys={practicalsPassed}
              nextKey={summary?.next?.key ?? (started ? undefined : first?.key)}
              started={started}
              status={
                summary?.state === "completed"
                  ? "You've finished this course"
                  : summary?.state === "awaiting_assessment"
                    ? "Awaiting your practical assessment"
                    : undefined
              }
              percent={summary?.percent}
              label={summary ? courseProgressLabel(summary, totals.required > 0) : undefined}
            />
          </aside>
        ) : null}
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <CourseTabs
            tabs={[
              {
                id: "about",
                label: "About",
                panel: (
                  <div className="flex max-w-[40rem] flex-col gap-3.5">
                    {course.summary ? (
                      <RichText source={course.summary} className="text-lead text-text-secondary" />
                    ) : null}
                    {course.objectives.length > 0 ? (
                      <>
                        <h2 className="mt-3 text-heading font-bold">What you&apos;ll learn</h2>
                        <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-text-secondary">
                          {course.objectives.map((objective) => (
                            <li key={objective}>{objective}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    <p className="mt-2 border-t border-border pt-3.5 text-small text-text-muted">
                      You mark each lesson complete yourself, and quizzes are scored automatically.
                      Finishing a course never approves you to serve on its own: that comes from
                      assessments with a trainer. Version {course.versionNumber}.
                    </p>
                  </div>
                ),
              },
              ...(summary
                ? [
                    {
                      id: "results",
                      label: "Quiz results",
                      panel: (
                        <div className="flex max-w-[40rem] flex-col gap-2.5">
                          {attempts.length === 0 ? (
                            <p className="text-text-secondary">
                              You haven&apos;t taken a quiz in this course yet. Your results will
                              show here.
                            </p>
                          ) : (
                            attempts.map((attempt) => (
                              <Link
                                key={attempt.id}
                                href={`/courses/${course.id}/quizzes/${attempt.quizKey}/attempts/${attempt.id}`}
                                className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3.5 transition-surface hover:bg-hover"
                              >
                                <span className="flex min-w-0 flex-col">
                                  <span className="font-semibold">
                                    {course.quizzes.find((quiz) => quiz.key === attempt.quizKey)
                                      ?.title ?? "A quiz from an earlier version"}
                                  </span>
                                  <span className="text-small text-text-muted">
                                    {attempt.correctCount ?? 0} of {attempt.questionCount}
                                    {attempt.submittedAt
                                      ? ` · ${formatDate(attempt.submittedAt)}`
                                      : ""}
                                  </span>
                                </span>
                                <StatusBadge tone={attempt.passed ? "success" : "neutral"}>
                                  {attempt.passed ? "Passed" : "Not yet"}
                                </StatusBadge>
                              </Link>
                            ))
                          )}
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {icon}
      {children}
    </li>
  );
}

/**
 * Begin a course again, after a warning (SRS-PROG-009). It says exactly what goes and what stays,
 * because it changes what someone sees, even though the old results are kept on record.
 */
function StartOver({
  courseId,
  title,
  hasCertificate,
}: {
  courseId: string;
  title: string;
  hasCertificate: boolean;
}) {
  return (
    <ConfirmDialog
      triggerLabel="Start over"
      srLabel={title}
      title={`Start ${title} over?`}
      message={
        <div className="flex flex-col gap-2">
          <p>
            This clears your completed lessons, your place in each video, and your quiz results for
            this course. You&apos;ll begin again from the first lesson and retake its quizzes.
          </p>
          <p>
            {hasCertificate ? "Your certificate stays. " : ""}Any practical you&apos;ve passed
            stays, and this doesn&apos;t change whether you&apos;re approved to serve.
          </p>
          <p className="font-medium text-text">You can&apos;t undo this yourself.</p>
        </div>
      }
    >
      <ActionForm
        action={restartCourseAction}
        submitLabel="Yes, start over"
        pendingLabel="Starting over…"
        variant="destructive"
        hidden={{ courseId }}
      />
    </ConfirmDialog>
  );
}
