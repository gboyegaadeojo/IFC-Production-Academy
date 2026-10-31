import Link from "next/link";
import { flattenLessons, formatMinutes, type OutlineModule } from "@/lib/domain/learning";

/**
 * Course outline (DESIGN §4.4 LessonList, §6.4–6.5): modules and lessons in teaching order. In the
 * lesson view the current lesson is marked with aria-current and a rule, never colour alone.
 */
export function CourseOutline({
  courseId,
  modules,
  currentKey,
  compact = false,
}: {
  courseId: string;
  modules: OutlineModule[];
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
