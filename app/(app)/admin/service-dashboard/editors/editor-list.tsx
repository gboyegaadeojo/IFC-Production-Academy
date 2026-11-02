"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { DashboardPerson } from "@/lib/data/service-dashboard";
import { MAX_EDITORS } from "@/lib/domain/service-dashboard";
import { setEditorAction } from "../actions";

/** Editors first, then a search for anyone else active. */
export function EditorList({ people }: { people: DashboardPerson[] }) {
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const editors = people.filter((person) => person.isEditor);
  const term = search.trim().toLowerCase();
  const matches =
    term === ""
      ? []
      : people
          .filter((person) => !person.isEditor && person.displayName.toLowerCase().includes(term))
          .slice(0, 10);
  const full = editors.length >= MAX_EDITORS;

  function setEditor(person: DashboardPerson, isEditor: boolean) {
    startTransition(async () => {
      const result = await setEditorAction({ userId: person.id, isEditor });
      setMessage({
        text: result.ok
          ? `${person.displayName} ${isEditor ? "can now edit" : "can no longer edit"} the layout.`
          : result.message,
        failed: !result.ok,
      });
      if (result.ok) {
        setSearch("");
      }
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <section aria-labelledby="editors-heading" className="flex flex-col gap-2">
        <h2 id="editors-heading" className="text-heading font-semibold">
          Editors ({editors.length} of {MAX_EDITORS})
        </h2>
        {editors.length === 0 ? (
          <p className="text-text-secondary">No editors yet. Find someone below to add them.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
            {editors.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-2">
                {person.displayName}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  aria-label={`Remove ${person.displayName}`}
                  onClick={() => setEditor(person, false)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-editor-heading" className="flex flex-col gap-2">
        <h2 id="add-editor-heading" className="text-heading font-semibold">
          Add an editor
        </h2>
        {full ? (
          <p className="text-text-secondary">
            All {MAX_EDITORS} spots are taken. Remove someone first.
          </p>
        ) : (
          <>
            <label htmlFor="editor-search" className="text-small font-medium text-text-secondary">
              Find a person
            </label>
            <input
              id="editor-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-touch rounded-button border border-border-strong bg-card px-3"
            />
            {term !== "" && matches.length === 0 ? (
              <p className="text-small text-text-secondary">Nobody by that name.</p>
            ) : null}
            {matches.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
                {matches.map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    {person.displayName}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      aria-label={`Add ${person.displayName}`}
                      onClick={() => setEditor(person, true)}
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <p
        role="status"
        className={`text-small ${message?.failed ? "text-error" : "text-text-secondary"}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
