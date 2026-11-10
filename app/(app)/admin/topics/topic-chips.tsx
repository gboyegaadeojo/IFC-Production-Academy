"use client";

import { useState } from "react";
import { ActionForm, Field } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { createTopicAction, removeTopicAction, renameTopicAction } from "./actions";
import { topicChipClasses } from "./topic-chip-classes";

/**
 * Every topic as a chip (Course Hierarchy mock, approved 2026-11-04). Choosing one opens its rename
 * and remove controls, for those who may tidy the list. "+ New topic" opens the add form.
 */
export function TopicChips({
  topics,
  canTidy,
}: {
  topics: { id: string; name: string }[];
  canTidy: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = topics.find((topic) => topic.id === selectedId);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-1.5">
        {topics.map((topic) => (
          <li key={topic.id}>
            {canTidy ? (
              <button
                type="button"
                aria-pressed={topic.id === selectedId}
                onClick={() => {
                  setSelectedId(topic.id === selectedId ? null : topic.id);
                  setAdding(false);
                }}
                className={topicChipClasses}
              >
                {topic.name}
              </button>
            ) : (
              <span className={`${topicChipClasses} inline-flex items-center hover:bg-surface`}>
                {topic.name}
              </span>
            )}
          </li>
        ))}
        <li>
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => {
              setAdding(!adding);
              setSelectedId(null);
            }}
            className={topicChipClasses}
          >
            + New topic
          </button>
        </li>
      </ul>
      {adding ? (
        <ActionForm
          action={createTopicAction}
          submitLabel="Add topic"
          pendingLabel="Adding…"
          className="flex max-w-md flex-col gap-3 border-t border-border pt-3"
        >
          <Field id="new-topic" label="New topic">
            <input id="new-topic" name="name" required maxLength={60} className={fieldClasses} />
          </Field>
        </ActionForm>
      ) : null}
      {selected ? (
        <div key={selected.id} className="flex flex-col gap-3 border-t border-border pt-3">
          <ActionForm
            action={renameTopicAction}
            submitLabel="Rename"
            variant="secondary"
            hidden={{ topicId: selected.id }}
            srLabel={selected.name}
            className="flex max-w-md flex-col gap-3"
          >
            <Field id="topic-name" label="Topic name">
              <input
                id="topic-name"
                name="name"
                required
                maxLength={60}
                defaultValue={selected.name}
                className={fieldClasses}
              />
            </Field>
          </ActionForm>
          <ActionForm
            action={removeTopicAction}
            submitLabel="Remove"
            pendingLabel="Removing…"
            variant="tertiary"
            hidden={{ topicId: selected.id }}
            srLabel={`${selected.name} from every lesson`}
          />
        </div>
      ) : null}
    </div>
  );
}
