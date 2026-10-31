import Link from "next/link";
import { CheckIcon, ClockIcon } from "@/components/ui/icons";
import { flattenLessons, formatMinutes, type OutlineModule } from "@/lib/domain/learning";
import { progressFor, type LessonProgress } from "@/lib/domain/progress";

/**
 * Course outline (DESIGN §4.4 LessonList, §6.4–6.5): modules and lessons in teaching order. In the
 * lesson view the current lesson is marked with aria-current and a rule, never colour alone; each
 * lesson's progress is an icon with words for screen readers.
 */
export function CourseOutline({
  courseId,
  modules,
  progress,
  currentKey,
  compact = false,
}: {
  courseId: string;
  modules: OutlineModule[];
  /** The learner's progress by lesson key. Omitted when progress isn't tracked for them. */
  progress?: ReadonlyMap<string, LessonProgress>;
  currentKey?: string;
  compact?: boolean;
}) {
  const numbers = new Map(flattenLessons(modules).map((lesson, index) => [lesson.key, index + 1]));
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
        </div>
      ))}
    </div>
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
