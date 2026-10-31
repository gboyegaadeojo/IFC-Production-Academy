import Link from "next/link";
import { CheckIcon, ClockIcon, QuizIcon, UserCheckIcon } from "@/components/ui/icons";
import {
  flattenLessons,
  formatMinutes,
  stepHref,
  type CoursePractical,
  type CourseQuiz,
  type OutlineModule,
} from "@/lib/domain/learning";
import { progressFor, type LessonProgress } from "@/lib/domain/progress";

/**
 * Course outline (DESIGN §4.4 LessonList, §6.4–6.5): modules and lessons in teaching order. In the
 * lesson view the current lesson is marked with aria-current and a rule, never colour alone; each
 * lesson's progress is an icon with words for screen readers. Quizzes and practical assessments
 * follow the module they're placed after, or close the course.
 */
export function CourseOutline({
  courseId,
  modules,
  quizzes = [],
  practicals = [],
  progress,
  passedQuizKeys,
  passedPracticalKeys,
  currentKey,
  compact = false,
}: {
  courseId: string;
  modules: OutlineModule[];
  quizzes?: readonly CourseQuiz[];
  practicals?: readonly CoursePractical[];
  /** The learner's progress by lesson key. Omitted when progress isn't tracked for them. */
  progress?: ReadonlyMap<string, LessonProgress>;
  passedQuizKeys?: ReadonlySet<string>;
  passedPracticalKeys?: ReadonlySet<string>;
  /** The current lesson, quiz, or practical key. */
  currentKey?: string;
  compact?: boolean;
}) {
  const numbers = new Map(flattenLessons(modules).map((lesson, index) => [lesson.key, index + 1]));
  const moduleIds = new Set(modules.map((m) => m.id));
  const checks: Check[] = [
    ...quizzes.map((quiz) => ({
      ...quiz,
      kind: "quiz" as const,
      passed: passedQuizKeys?.has(quiz.key) ?? false,
    })),
    ...practicals.map((practical) => ({
      ...practical,
      kind: "practical" as const,
      passed: passedPracticalKeys?.has(practical.key) ?? false,
    })),
  ];
  const endChecks = checks.filter(
    (check) => check.afterModuleId === null || !moduleIds.has(check.afterModuleId),
  );
  const checkList = (list: readonly Check[]) =>
    list.length === 0 ? null : (
      <CheckList
        courseId={courseId}
        checks={list}
        showProgress={progress !== undefined}
        currentKey={currentKey}
        compact={compact}
      />
    );
  return (
    <div className="flex flex-col gap-5">
      {modules.map((courseModule) => (
        <div key={courseModule.id} className="flex flex-col gap-2">
          <h3 className={compact ? "eyebrow" : "text-subheading font-semibold"}>
            {courseModule.title}
          </h3>
          {!compact && courseModule.summary ? (
            <p className="text-small text-text-secondary">{courseModule.summary}</p>
          ) : null}
          <ol
            className={
              compact
                ? "flex flex-col"
                : "flex flex-col divide-y divide-border border-y border-border"
            }
          >
            {courseModule.lessons.map((lesson) => {
              const current = lesson.key === currentKey;
              return (
                <li key={lesson.key}>
                  <Link
                    href={`/courses/${courseId}/lessons/${lesson.key}`}
                    aria-current={current ? "page" : undefined}
                    className={`relative flex items-baseline gap-3 transition-surface ${
                      compact
                        ? `min-h-touch rounded-button px-3 py-2 text-small lg:min-h-control ${
                            current
                              ? "bg-hover font-medium text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-pill before:bg-accent"
                              : "text-text-secondary hover:bg-card hover:text-text"
                          }`
                        : "min-h-touch px-1 py-3 hover:bg-card"
                    }`}
                  >
                    <span className="tabular w-6 shrink-0 font-mono text-small text-text-muted">
                      {String(numbers.get(lesson.key) ?? 0).padStart(2, "0")}
                    </span>
                    <span className="flex flex-1 flex-col">
                      <span className={compact ? "" : "font-medium text-text"}>{lesson.title}</span>
                      {!compact && (lesson.estimatedMinutes || !lesson.isRequired) ? (
                        <span className="text-small text-text-muted">
                          {[
                            lesson.estimatedMinutes ? formatMinutes(lesson.estimatedMinutes) : null,
                            lesson.isRequired ? null : "Optional",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    {compact && !lesson.isRequired ? (
                      <span className="text-small text-text-muted">Optional</span>
                    ) : null}
                    {progress ? (
                      <LessonMarker state={progressFor(progress, lesson.key).state} />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
          {checkList(checks.filter((check) => check.afterModuleId === courseModule.id))}
        </div>
      ))}
      {endChecks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className={compact ? "eyebrow" : "text-subheading font-semibold"}>
            To finish the course
          </h3>
          {checkList(endChecks)}
        </div>
      ) : null}
    </div>
  );
}

type Check = (CourseQuiz | CoursePractical) & { kind: "quiz" | "practical"; passed: boolean };

const CHECK_LABELS = { quiz: "Quiz", practical: "Practical assessment" } as const;

function CheckList({
  courseId,
  checks,
  showProgress,
  currentKey,
  compact,
}: {
  courseId: string;
  checks: readonly Check[];
  showProgress: boolean;
  currentKey?: string;
  compact: boolean;
}) {
  return (
    <ul
      className={
        compact ? "flex flex-col" : "flex flex-col divide-y divide-border border-b border-border"
      }
    >
      {checks.map((check) => {
        const current = check.key === currentKey;
        const Icon = check.kind === "quiz" ? QuizIcon : UserCheckIcon;
        return (
          <li key={`${check.kind}-${check.key}`}>
            <Link
              href={stepHref(courseId, check)}
              aria-current={current ? "page" : undefined}
              className={`relative flex items-baseline gap-3 transition-surface ${
                compact
                  ? `min-h-touch rounded-button px-3 py-2 text-small lg:min-h-control ${
                      current
                        ? "bg-hover font-medium text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-pill before:bg-accent"
                        : "text-text-secondary hover:bg-card hover:text-text"
                    }`
                  : "min-h-touch px-1 py-3 hover:bg-card"
              }`}
            >
              <span className="flex w-6 shrink-0 self-center text-text-muted">
                <Icon className="size-4" />
              </span>
              <span className="flex flex-1 flex-col">
                <span className={compact ? "" : "font-medium text-text"}>
                  <span className="sr-only">{CHECK_LABELS[check.kind]}: </span>
                  {check.title}
                </span>
                {!compact ? (
                  <span className="text-small text-text-muted">
                    {CHECK_LABELS[check.kind]}
                    {check.isRequired ? "" : " · Optional"}
                  </span>
                ) : null}
              </span>
              {compact && !check.isRequired ? (
                <span className="text-small text-text-muted">Optional</span>
              ) : null}
              {showProgress && check.passed ? (
                <span className="flex shrink-0 items-center self-center text-success">
                  <CheckIcon className="size-4" />
                  <span className="sr-only">, passed</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function LessonMarker({ state }: { state: LessonProgress["state"] }) {
  switch (state) {
    case "completed":
      return (
        <span className="flex shrink-0 items-center self-center text-success">
          <CheckIcon className="size-4" />
          <span className="sr-only">, completed</span>
        </span>
      );
    case "in_progress":
      return (
        <span className="flex shrink-0 items-center self-center text-text-muted">
          <ClockIcon className="size-4" />
          <span className="sr-only">, in progress</span>
        </span>
      );
    case "not_started":
      return null;
  }
}
