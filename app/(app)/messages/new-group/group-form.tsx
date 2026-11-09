"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, fieldClasses } from "@/components/ui/action-form";
import { ChevronLeftIcon } from "@/components/ui/icons";
import type { MessagingPerson } from "@/lib/domain/messages";
import { createGroupAction } from "../actions";
import { ChatAvatar } from "../chat-avatar";

/** Name a group, then turn on Everyone in the Academy, or choose people (ADD-MSG-07). */
export function GroupForm({ people }: { people: MessagingPerson[] }) {
  const [everyone, setEveryone] = useState(true);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const search = query.trim().toLocaleLowerCase();
  const shown = people.filter(
    (person) => chosen.has(person.userId) || person.name.toLocaleLowerCase().includes(search),
  );
  const count = everyone ? people.length + 1 : chosen.size + 1;

  function toggle(userId: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3 px-3 pt-3 pb-6 md:px-6">
      <div className="flex items-center gap-2">
        <Link
          href="/messages/new"
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-pill hover:bg-hover md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        <h1 className="text-[1.375rem] font-bold tracking-tight">New group chat</h1>
      </div>
      <ActionForm
        action={createGroupAction}
        submitLabel={`Make the group (${count} ${count === 1 ? "person" : "people"})`}
        pendingLabel="Making it…"
        hidden={{ everyone: everyone ? "true" : "false" }}
        className="flex max-w-xl flex-col gap-4"
        buttonClassName="rounded-pill px-5 font-semibold"
      >
        <label className="flex flex-col gap-1.5 text-small font-medium text-text-secondary">
          Name
          <input
            name="title"
            required
            maxLength={60}
            placeholder="For example, Sunday volunteers"
            className={`${fieldClasses} w-full`}
          />
        </label>
        <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-3">
          <ChatAvatar kind="group" name="Everyone" hue={null} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold" id="everyone-label">
              Everyone in the Academy
            </span>
            <span className="text-small text-text-muted">
              {people.length + 1} people now. New people join it automatically, and anyone who
              leaves the Academy leaves it.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={everyone}
            aria-labelledby="everyone-label"
            onClick={() => setEveryone(!everyone)}
            className={`relative mt-1 h-6 w-10 shrink-0 rounded-pill border transition-surface ${
              everyone ? "border-accent bg-accent" : "border-border-strong bg-hover"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 left-0.5 size-[1.125rem] rounded-pill transition-transform motion-reduce:transition-none ${
                everyone ? "translate-x-4 bg-on-accent" : "bg-text-muted"
              }`}
            />
          </button>
        </div>
        {everyone ? null : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-small font-medium text-text-secondary">
              Choose people ({chosen.size} chosen)
            </legend>
            <label className="sr-only" htmlFor="group-search">
              Find a person
            </label>
            <input
              id="group-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a person"
              autoComplete="off"
              className={`${fieldClasses} w-full`}
            />
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {shown.slice(0, 60).map((person) => (
                <li key={person.userId}>
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-card px-2 py-1.5 hover:bg-hover has-[:checked]:bg-accent-soft">
                    <input
                      type="checkbox"
                      name="userId"
                      value={person.userId}
                      checked={chosen.has(person.userId)}
                      onChange={() => toggle(person.userId)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <ChatAvatar
                      kind="person"
                      name={person.name}
                      hue={person.departmentHue}
                      size="sm"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{person.name}</span>
                      <span className="truncate text-small text-text-muted">
                        {person.departmentName ?? "Production team"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <p className="text-small text-text-muted">
          You, the Production Director and Platform Admins can delete messages in it.
        </p>
      </ActionForm>
    </div>
  );
}
