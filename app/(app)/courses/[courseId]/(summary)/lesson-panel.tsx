import Link from "next/link";
import { CheckIcon, PlayIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  courseSections,
  formatMinutes,
  stepHref,
  type CourseCheck,
  type CoursePractical,
  type CourseQuiz,
  type OutlineLesson,
  type OutlineModule,
} from "@/lib/domain/learning";
import { progressFor, type LessonProgress } from "@/lib/domain/progress";
import { LessonMarker } from "../course-outline";

const CHECK_LABELS = { quiz: "Quiz", practical: "Practical assessment" } as const;

/** A lesson's video still, or its department's colour when there isn't one. */
export function LessonThumbnail({
  url,
  minutes,
  dimmed = false,
  className,
}: {
  url: string | null | undefined;
  minutes?: number | null;
  dimmed?: boolean;
  className: string;
}) {
  return (
    <span
      className={`relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-button bg-[color-mix(in_srgb,var(--dept)_22%,var(--surface))] text-[var(--dept)] ${
        dimmed ? "opacity-55" : ""
      } ${className}`}
    >
      {url ? (
        // YouTube's stills, with no image service on this plan, so a plain image is right.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <PlayIcon className="size-4" />
      )}
      {minutes ? (
        <span className="tabular absolute right-1 bottom-1 rounded-sm bg-text px-1 text-[0.625rem] font-medium text-bg">
          {formatMinutes(minutes)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Every lesson in teaching order, with thumbnails, and each quiz and practical in its place (Course
 * Page mock, approved 2026-11-05). Progress is what the learner has marked complete: nothing here
 * claims a video was watched (SRS-LESSON-006).
 */
export function LessonPanel({
  courseId,
  modules,
  quizzes,
  practicals,
  questionCounts,
  progress,
  passedQuizKeys,
  passedPracticalKeys,
  nextKey,
  started,
  status,
  percent,
  label,
}: {
  courseId: string;
  modules: readonly OutlineModule[];
  quizzes: readonly CourseQuiz[];
  practicals: readonly CoursePractical[];
  questionCounts: ReadonlyMap<string, number>;
  /** Omitted when progress isn't tracked for this person. */
  progress?: ReadonlyMap<string, LessonProgress>;
  passedQuizKeys?: ReadonlySet<string>;
  passedPracticalKeys?: ReadonlySet<string>;
  nextKey?: string;
  started: boolean;
  /** "You've finished this course", or that it's waiting for a practical. */
  status?: string;
  percent?: number;
  label?: string;
}) {
  const sections = courseSections(modules, quizzes, practicals);
  const lessonRow = (lesson: OutlineLesson) => {
    const state = progress ? progressFor(progress, lesson.key).state : "not_started";
    const done = state === "completed";
    const next = lesson.key === nextKey;
    const note = next
      ? started
        ? "Up next"
        : "Start here"
      : lesson.isRequired
        ? null
        : "Optional";
    return (
      <li key={lesson.key}>
        <Link
          href={`/courses/${courseId}/lessons/${lesson.key}`}
          className={`-mx-1.5 flex min-h-touch items-center gap-3 rounded-button p-1.5 transition-surface hover:bg-hover ${
            next ? "bg-hover" : ""
          }`}
        >
          <LessonThumbnail
            url={lesson.thumbnailUrl}
            minutes={lesson.estimatedMinutes}
            dimmed={done}
            className="w-22"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`font-semibold ${done ? "text-text-secondary" : "text-text"}`}>
              {lesson.title}
            </span>
            {note ? <span className="text-small text-text-muted">{note}</span> : null}
          </span>
          {progress ? <LessonMarker state={state} /> : null}
        </Link>
      </li>
    );
  };
  const checkRow = (check: CourseCheck) => {
    const passed = (check.kind === "quiz" ? passedQuizKeys : passedPracticalKeys)?.has(check.key);
    const questions = check.kind === "quiz" ? questionCounts.get(check.key) : undefined;
    return (
      <li key={`${check.kind}-${check.key}`} className="my-1.5">
        <Link
          href={stepHref(courseId, check)}
          className="flex min-h-touch items-center gap-3 rounded-button bg-accent-soft px-3 py-2.5 transition-surface hover:brightness-95"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span aria-hidden="true" className="text-small font-semibold text-accent-light">
              {CHECK_LABELS[check.kind]}
              {questions ? ` · ${questions} ${questions === 1 ? "question" : "questions"}` : ""}
              {check.isRequired ? "" : " · Optional"}
            </span>
            <span className="font-semibold text-text">
              <span className="sr-only">{CHECK_LABELS[check.kind]}: </span>
              {check.title}
            </span>
          </span>
          {progress && passed ? (
            <span className="flex shrink-0 items-center gap-1 text-small font-semibold text-success">
              <CheckIcon className="size-3.5" />
              Passed
              <span className="sr-only">, passed</span>
            </span>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <section
      aria-labelledby="lessons-heading"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-2">
        <h2 id="lessons-heading" className="text-subheading font-semibold">
          Lessons
        </h2>
        {status ? <p className="font-medium">{status}</p> : null}
        {percent !== undefined ? <ProgressBar percent={percent} label="Course progress" /> : null}
        {label ? <p className="text-small text-text-secondary">{label}</p> : null}
      </div>
      <div className="flex flex-col">
        {sections.modules.map(({ module, checks }) => (
          <div key={module.id} className="flex flex-col">
            <h3 className="mt-3 mb-1 eyebrow">{module.title}</h3>
            <ol className="flex flex-col">{module.lessons.map(lessonRow)}</ol>
            {checks.length > 0 ? <ul className="flex flex-col">{checks.map(checkRow)}</ul> : null}
          </div>
        ))}
        {sections.endChecks.length > 0 ? (
          <div className="flex flex-col">
            <h3 className="mt-3 mb-1 eyebrow">To finish the course</h3>
            <ul className="flex flex-col">{sections.endChecks.map(checkRow)}</ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
