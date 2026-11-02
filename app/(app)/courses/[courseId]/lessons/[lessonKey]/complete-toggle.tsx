"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { completeLessonAction, reopenLessonAction } from "./actions";

const idle: FormState = { status: "idle" };

/**
 * "Mark complete" and, once done, a green "Completed" that marks it not complete again (lesson
 * page mock, approved 2026-11-02). The learner decides; nothing checks the video (SRS-LESSON-006).
 * Used beside the title on larger screens and in the phone's bottom bar.
 */
export function CompleteToggle({
  done,
  courseId,
  lessonKey,
  className = "",
}: {
  done: boolean;
  courseId: string;
  lessonKey: string;
  className?: string;
}) {
  const [completeState, complete, completing] = useActionState(completeLessonAction, idle);
  const [reopenState, reopen, reopening] = useActionState(reopenLessonAction, idle);
  const statusId = useId();
  const pending = completing || reopening;
  const state = done ? reopenState : completeState;
  const failed = state.status === "error";

  return (
    <form action={done ? reopen : complete} className={className}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="lessonKey" value={lessonKey} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={done}
        aria-describedby={statusId}
        className={
          done
            ? `${buttonClasses("secondary", "w-full gap-2 border-transparent bg-success-soft text-success hover:border-success")}`
            : buttonClasses("primary", "w-full")
        }
      >
        {pending ? (
          "Saving…"
        ) : done ? (
          <>
            <CheckIcon className="size-4" />
            Completed
            <span className="sr-only">. Select to mark as not complete</span>
          </>
        ) : failed ? (
          "Try again"
        ) : (
          "Mark complete"
        )}
      </button>
      <span id={statusId} role="status" className="sr-only">
        {state.status === "idle" ? "" : state.message}
      </span>
    </form>
  );
}
