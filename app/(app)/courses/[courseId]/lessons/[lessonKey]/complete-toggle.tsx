"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import type { FormState } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { completeLessonAction, reopenLessonAction } from "./actions";

const idle: FormState = { status: "idle" };

/**
 * "Mark complete" and, once done, a green "Completed" that marks it not complete again (lesson
 * page mock, approved 2026-11-02). The learner decides; nothing checks the video (SRS-LESSON-006).
 * It changes on the tap and goes back, saying so, if the save fails.
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
  const [shownDone, setShownDone] = useOptimistic(done);
  const [state, setState] = useState<FormState>(idle);
  const [pending, startTransition] = useTransition();
  const statusId = useId();
  const failed = state.status === "error";

  function save(formData: FormData) {
    startTransition(async () => {
      setShownDone(!done);
      try {
        setState(await (done ? reopenLessonAction : completeLessonAction)(idle, formData));
      } catch {
        setState({
          status: "error",
          message: "That didn't save. Check your connection and try again.",
        });
      }
    });
  }

  return (
    <form action={save} className={className}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="lessonKey" value={lessonKey} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={shownDone}
        aria-describedby={statusId}
        className={
          shownDone
            ? `${buttonClasses("secondary", "w-full gap-2 border-transparent bg-success-soft text-success hover:border-success")}`
            : buttonClasses("primary", "w-full")
        }
      >
        {shownDone ? (
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
