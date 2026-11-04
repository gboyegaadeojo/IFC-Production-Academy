"use client";

import { useState, useTransition } from "react";
import { fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { addTopicFromLessonAction, saveLessonTopicsAction } from "../../../../topics/actions";

type Topic = { id: string; name: string };

/**
 * A lesson's topics (SRS-CUR-019). Each change saves straight away: tags aren't part of a version,
 * so they also work on a lesson that's already published.
 */
export function LessonTopics({
  courseId,
  lessonKey,
  topics,
  initial,
  canAdd,
}: {
  courseId: string;
  lessonKey: string;
  topics: Topic[];
  initial: string[];
  canAdd: boolean;
}) {
  const [all, setAll] = useState(topics);
  const [selected, setSelected] = useState(initial);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function save(next: string[], previous: string[]) {
    setSelected(next);
    startTransition(async () => {
      const ok = await saveLessonTopicsAction({ courseId, lessonKey, topicIds: next });
      if (ok) {
        setMessage("Saved.");
      } else {
        setSelected(previous);
        setMessage("That didn't save. Check that your role allows this, then try again.");
      }
    });
  }

  function add() {
    startTransition(async () => {
      const topic = await addTopicFromLessonAction(draft);
      if (!topic) {
        setMessage("That topic couldn't be added.");
        return;
      }
      setAll((current) =>
        current.some((t) => t.id === topic.id)
          ? current
          : [...current, topic].toSorted((a, b) => a.name.localeCompare(b.name)),
      );
      setDraft("");
      if (!selected.includes(topic.id)) {
        const next = [...selected, topic.id];
        setSelected(next);
        const ok = await saveLessonTopicsAction({ courseId, lessonKey, topicIds: next });
        setMessage(ok ? `Added ${topic.name}.` : "That didn't save. Try again.");
      }
    });
  }

  return (
    <section aria-labelledby="lesson-topics-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="lesson-topics-heading" className="text-heading font-semibold">
          Topics
        </h2>
        <p className="text-small text-text-secondary">
          These help people find this lesson under Videos. They save straight away, with no draft.
        </p>
      </div>
      {all.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {all.map((topic) => {
            const on = selected.includes(topic.id);
            return (
              <li key={topic.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={pending}
                  onClick={() =>
                    save(
                      on ? selected.filter((id) => id !== topic.id) : [...selected, topic.id],
                      selected,
                    )
                  }
                  className="min-h-control rounded-pill border border-border-strong px-3 text-small font-medium text-text-secondary transition-surface hover:bg-hover aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-light"
                >
                  {topic.name}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-small text-text-muted">No topics yet.</p>
      )}
      {canAdd ? (
        <div className="flex max-w-md flex-wrap items-center gap-2">
          <input
            aria-label="New topic"
            value={draft}
            maxLength={60}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="New topic"
            className={`${fieldClasses} min-w-40 flex-1`}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !draft.trim()}
            onClick={add}
          >
            Add topic
          </Button>
        </div>
      ) : null}
      <p role="status" className="text-small text-text-muted">
        {message}
      </p>
    </section>
  );
}
