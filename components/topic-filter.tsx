"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { ChevronDownIcon } from "@/components/ui/icons";

/**
 * The Topic filter on Courses and Videos: a button, and a panel of tick boxes that takes a full
 * line of the wrapping row it sits in (SRS-CUR-019).
 */
export function TopicFilter({
  topics,
  selected,
  onChange,
}: {
  topics: { id: string; name: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (topics.length === 0) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="topic-filter"
        onClick={() => setOpen(!open)}
        className={`${buttonClasses("secondary", "gap-1.5", "sm")} order-1`}
      >
        Topic{selected.length > 0 ? ` (${selected.length})` : ""}
        <ChevronDownIcon className={`size-4 transition-surface ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <fieldset
          id="topic-filter"
          className="order-3 grid w-full grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-1 rounded-card border border-border bg-surface px-4 py-3"
        >
          <legend className="px-1 text-small text-text-muted">Choose any topics</legend>
          {topics.map((topic) => (
            <label
              key={topic.id}
              className="flex min-h-touch items-center gap-2 pointer-fine:min-h-8"
            >
              <input
                type="checkbox"
                checked={selected.includes(topic.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, topic.id]
                      : selected.filter((id) => id !== topic.id),
                  )
                }
              />
              {topic.name}
            </label>
          ))}
        </fieldset>
      ) : null}
    </>
  );
}
