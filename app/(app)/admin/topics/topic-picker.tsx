"use client";

import { useState, useTransition, type ReactNode } from "react";
import { fieldClasses } from "@/components/ui/field-classes";
import { Button } from "@/components/ui/button";
import { addTopicAction } from "./actions";
import { topicChipClasses } from "./topic-chip-classes";

type Topic = { id: string; name: string };

/**
 * Choosing topics for a lesson or a course (Course Hierarchy mock; SRS-CUR-019). Each change saves
 * straight away: tags aren't part of a version, so they also work on what's already published.
 */
export function TopicPicker({
  topics,
  initial,
  canAdd,
  save,
  hint,
  children,
}: {
  topics: Topic[];
  initial: string[];
  canAdd: boolean;
  save: (topicIds: string[]) => Promise<boolean>;
  hint: string;
  /** What's being tagged, above the chips. */
  children: ReactNode;
}) {
  const [all, setAll] = useState(topics);
  const [selected, setSelected] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function choose(next: string[], previous: string[]) {
    setSelected(next);
    startTransition(async () => {
      if (await save(next)) {
        setMessage("Saved.");
      } else {
        setSelected(previous);
        setMessage("That didn't save. Check that your role allows this, then try again.");
      }
    });
  }

  function add() {
    startTransition(async () => {
      const topic = await addTopicAction(draft);
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
      setAdding(false);
      if (!selected.includes(topic.id)) {
        const next = [...selected, topic.id];
        setSelected(next);
        setMessage((await save(next)) ? `Added ${topic.name}.` : "That didn't save. Try again.");
      }
    });
  }

  return (
    <section
      aria-labelledby="topic-picker-heading"
      className="flex max-w-[40rem] flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      {children}
      <div className="flex flex-col gap-1.5">
        <h2 id="topic-picker-heading" className="font-semibold">
          Topics
        </h2>
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
                    choose(
                      on ? selected.filter((id) => id !== topic.id) : [...selected, topic.id],
                      selected,
                    )
                  }
                  className={topicChipClasses}
                >
                  {topic.name}
                </button>
              </li>
            );
          })}
          {canAdd ? (
            <li>
              <button
                type="button"
                aria-expanded={adding}
                onClick={() => setAdding(!adding)}
                className={topicChipClasses}
              >
                + New topic
              </button>
            </li>
          ) : null}
        </ul>
      </div>
      {adding ? (
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
        {message || hint}
      </p>
    </section>
  );
}
