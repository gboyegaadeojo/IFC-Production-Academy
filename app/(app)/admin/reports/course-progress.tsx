"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { fieldClasses } from "@/components/ui/field-classes";
import { Button, buttonClasses } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  lessonPercent,
  lessonsDone,
  nextLessonKey,
  statusCounts,
  type AssignablePerson,
  type CourseProgressView,
  type PersonProgress,
  type ProgressStatus,
} from "@/lib/domain/course-progress";
import { formatDate } from "@/lib/domain/dates";
import { triesLabel } from "@/lib/domain/quiz-results";
import { removeAssignmentAction } from "./actions";
import { AssignCourse } from "./assign-course";

const STATUS_LABELS: Record<ProgressStatus, string> = {
  finished: "Finished",
  in_progress: "In progress",
  not_started: "Not started",
};
const STATUS_DOTS: Record<ProgressStatus, string> = {
  finished: "bg-success",
  in_progress: "bg-accent-light",
  not_started: "bg-border-strong",
};

/**
 * Course progress (approved mock, Design B, 2026-11-04; ADD-REPORT-02): three numbers that filter
 * the list, people on one side, and the chosen person's lessons, quizzes, and practicals on the other.
 */
export function CourseProgress({
  courses,
  view,
  departmentId,
  canMentor,
  assignable,
}: {
  courses: { id: string; title: string }[];
  view: CourseProgressView;
  departmentId: string;
  canMentor: boolean;
  /** Who this course can be assigned to, or null if this person can't assign. */
  assignable: AssignablePerson[] | null;
}) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  // Held here because removing someone's assignment can take the panel, or them, off the page.
  const [removal, removeAction, removing] = useActionState(removeAssignmentAction, {
    status: "idle",
  });
  const [status, setStatus] = useState<ProgressStatus | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const counts = statusCounts(view.people);
  const shown = status ? view.people.filter((person) => person.status === status) : view.people;
  const chosen = shown.find((person) => person.userId === chosenId) ?? shown[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="progress-course" className="text-small font-medium text-text-secondary">
          Course
        </label>
        <select
          id="progress-course"
          value={view.courseId}
          onChange={(event) =>
            router.push(
              `/admin/reports?department=${departmentId}&report=progress&course=${event.target.value}`,
            )
          }
          className={`${fieldClasses} w-full max-w-md`}
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-text-muted">
          {view.level === null ? "" : `Level ${view.level} · `}
          {view.lessons.length} {view.lessons.length === 1 ? "lesson" : "lessons"} ·{" "}
          {view.people.length} {view.people.length === 1 ? "person" : "people"}
        </p>
        {assignable ? (
          <button
            type="button"
            aria-expanded={assigning}
            onClick={() => setAssigning(!assigning)}
            className={buttonClasses("primary", "gap-1.5")}
          >
            <PlusIcon className="size-4" />
            Assign to someone
          </button>
        ) : null}
      </div>

      {removal.status === "idle" ? null : (
        <p
          role={removal.status === "error" ? "alert" : "status"}
          className={`text-small ${removal.status === "error" ? "text-error" : "text-text-secondary"}`}
        >
          {removal.message}
        </p>
      )}

      {assignable && assigning ? (
        <AssignCourse
          courseId={view.courseId}
          departmentId={departmentId}
          people={assignable}
          assignedIds={view.people.filter((p) => p.assignedAt).map((p) => p.userId)}
        />
      ) : null}

      <div className="grid grid-cols-3 gap-2.5">
        {(Object.keys(STATUS_LABELS) as ProgressStatus[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={status === key}
            onClick={() => setStatus(status === key ? null : key)}
            className="flex lift flex-col gap-0.5 rounded-card border border-border bg-surface px-3.5 py-3 text-left aria-pressed:border-accent aria-pressed:shadow-[0_0_0_1px_var(--accent)]"
          >
            <span className="flex items-center gap-1.5 text-small text-text-secondary">
              <span aria-hidden="true" className={`size-2 rounded-pill ${STATUS_DOTS[key]}`} />
              {STATUS_LABELS[key]}
            </span>
            <span className="tabular text-title font-bold">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rounded-card border border-border bg-surface p-1.5">
          {shown.length === 0 ? (
            <p className="p-3 text-small text-text-secondary">Nobody here right now.</p>
          ) : (
            <ul>
              {shown.map((person) => {
                const done = lessonsDone(person, view);
                const percent = lessonPercent(done, view.lessons.length);
                return (
                  <li key={person.userId}>
                    <button
                      type="button"
                      aria-pressed={chosen?.userId === person.userId}
                      onClick={() => setChosenId(person.userId)}
                      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-button px-3 py-2.5 text-left transition-surface hover:bg-hover aria-pressed:bg-accent-soft"
                    >
                      <Avatar name={person.name} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold">{person.name}</span>
                        <span className="text-small text-text-muted">
                          {done} of {view.lessons.length} lessons
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-1 h-1.5 overflow-hidden rounded-pill bg-border"
                        >
                          <span
                            className={`block h-full rounded-pill ${percent === 100 ? "bg-success" : "bg-accent-light"}`}
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                      </span>
                      <span className="tabular text-small text-text-secondary">{percent}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {chosen ? (
          <PersonPanel
            person={chosen}
            view={view}
            departmentId={departmentId}
            canMentor={canMentor}
            canAssign={assignable !== null}
            removeAction={removeAction}
            removing={removing}
          />
        ) : null}
      </div>
      <p className="text-small text-text-muted">
        A finished course is separate from being approved to serve. Team managers still decide who
        serves.
      </p>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-button border border-border bg-card p-2.5">
      <span className="text-small text-text-muted">{label}</span>
      <span className="tabular font-bold">{value}</span>
      {note ? <span className="text-small text-text-muted">{note}</span> : null}
    </div>
  );
}

function PersonPanel({
  person,
  view,
  departmentId,
  canMentor,
  canAssign,
  removeAction,
  removing,
}: {
  person: PersonProgress;
  view: CourseProgressView;
  departmentId: string;
  canMentor: boolean;
  canAssign: boolean;
  removeAction: (formData: FormData) => void;
  removing: boolean;
}) {
  const next = nextLessonKey(person, view);
  const onlyQuiz = view.quizzes.length === 1 ? person.quizzes[0] : undefined;
  const quizzesPassed = person.quizzes.filter((quiz) => quiz.passed).length;
  const practicalsPassed = view.practicals.filter((p) =>
    person.passedPracticals.includes(p.key),
  ).length;
  return (
    <section
      aria-label={person.name}
      className="flex min-w-0 flex-col gap-3.5 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar name={person.name} />
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-heading font-semibold">{person.name}</h3>
          <span className="w-fit pt-0.5">
            <StatusBadge tone={person.status === "finished" ? "success" : "neutral"}>
              {STATUS_LABELS[person.status]}
            </StatusBadge>
          </span>
          {person.assignedAt ? (
            <span className="pt-1 text-small text-text-muted">
              Assigned {formatDate(person.assignedAt)}
            </span>
          ) : person.status === "not_started" ? null : (
            <span className="pt-1 text-small text-text-muted">Started on their own</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Fact label="Lessons" value={`${lessonsDone(person, view)} of ${view.lessons.length}`} />
        {view.quizzes.length === 0 ? (
          <Fact label="Quiz" value="None" />
        ) : view.quizzes.length === 1 ? (
          <Fact
            label="Quiz"
            value={onlyQuiz ? `${onlyQuiz.best.score}%` : "Not yet"}
            note={onlyQuiz ? triesLabel(onlyQuiz.tries.length) : undefined}
          />
        ) : (
          <Fact
            label="Quizzes"
            value={`${quizzesPassed} of ${view.quizzes.length}`}
            note="passed"
          />
        )}
        {view.practicals.length === 0 ? (
          <Fact label="Practical" value="None" />
        ) : view.practicals.length === 1 ? (
          <Fact label="Practical" value={practicalsPassed === 1 ? "Passed" : "Not yet"} />
        ) : (
          <Fact
            label="Practicals"
            value={`${practicalsPassed} of ${view.practicals.length}`}
            note="passed"
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-small font-medium text-text-muted">Lessons marked complete</h4>
        <ol>
          {view.lessons.map((lesson, index) => {
            const done = person.completedLessons.includes(lesson.key);
            const isNext = lesson.key === next;
            return (
              <li
                key={lesson.key}
                className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 pb-2.5"
              >
                {index < view.lessons.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute top-5 bottom-0 left-[0.5625rem] w-0.5 ${done ? "bg-success-line" : "bg-border"}`}
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={`relative flex size-5 items-center justify-center rounded-pill border-2 ${
                    done
                      ? "border-success bg-success text-surface"
                      : isNext
                        ? "border-accent-light bg-surface"
                        : "border-border-strong bg-surface"
                  }`}
                >
                  {done ? <CheckIcon className="size-3" /> : null}
                </span>
                <span className={done ? "" : "text-text-secondary"}>
                  {lesson.title}
                  <span className="sr-only">{done ? ": complete" : ": not yet"}</span>
                  {isNext ? <span className="text-small text-accent-light"> · next</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {canMentor ? (
        <Link
          href={`/admin/mentoring?department=${departmentId}`}
          className={`${buttonClasses("secondary")} w-fit`}
        >
          Pair a mentor
        </Link>
      ) : null}
      {canAssign && person.assignedAt ? (
        <form action={removeAction}>
          <input type="hidden" name="courseId" value={view.courseId} />
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="userId" value={person.userId} />
          <Button type="submit" variant="secondary" disabled={removing}>
            {removing ? "Removing…" : "Remove assignment"}
            <span className="sr-only"> for {person.name}</span>
          </Button>
        </form>
      ) : null}
    </section>
  );
}
