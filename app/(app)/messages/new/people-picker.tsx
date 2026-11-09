"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronLeftIcon } from "@/components/ui/icons";
import type { MessagingPerson } from "@/lib/domain/messages";
import { startDirectAction } from "../actions";
import { ChatAvatar } from "../chat-avatar";

/** Choose someone to message (screen 5 of the mock). Anyone active in the Academy. */
export function PeoplePicker({
  people,
  canCreateGroup,
}: {
  people: MessagingPerson[];
  canCreateGroup: boolean;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const shown = people
    .filter((person) => person.name.toLocaleLowerCase().includes(search))
    .slice(0, 50);

  return (
    <div className="flex flex-col gap-3 px-3 pt-3 pb-6 md:px-6">
      <div className="flex items-center gap-2">
        <Link
          href="/messages"
          aria-label="Back to chats"
          className="flex size-10 items-center justify-center rounded-pill hover:bg-hover md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        <h1 className="text-[1.375rem] font-bold tracking-tight">New message</h1>
      </div>
      <label className="sr-only" htmlFor="person-search">
        Find a person
      </label>
      <input
        id="person-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a person"
        autoComplete="off"
        autoFocus
        className="min-h-control rounded-button border border-border bg-card px-3 text-field placeholder:text-text-muted"
      />
      {canCreateGroup ? (
        <Link
          href="/messages/new-group"
          className="flex min-h-16 items-center gap-3 rounded-card px-2 py-2 transition-surface hover:bg-hover"
        >
          <ChatAvatar kind="group" name="Group" hue={null} />
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">New group chat</span>
            <span className="text-small text-text-muted">
              Chosen people, or everyone in the Academy
            </span>
          </span>
        </Link>
      ) : null}
      <h2 className="mt-1 px-1 text-[0.6875rem] font-bold tracking-[0.06em] text-text-muted uppercase">
        People in the Academy
      </h2>
      {shown.length === 0 ? (
        <p className="px-1 text-text-secondary">Nobody matches that.</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((person) => (
            <li key={person.userId}>
              <form action={startDirectAction}>
                <input type="hidden" name="userId" value={person.userId} />
                <PersonButton person={person} />
              </form>
            </li>
          ))}
        </ul>
      )}
      {people.length > shown.length && !search ? (
        <p className="px-1 text-small text-text-muted">Type a name to find someone else.</p>
      ) : null}
    </div>
  );
}

function PersonButton({ person }: { person: MessagingPerson }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-16 w-full items-center gap-3 rounded-card px-2 py-2 text-left transition-surface hover:bg-hover disabled:opacity-60"
    >
      <ChatAvatar kind="person" name={person.name} hue={person.departmentHue} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{person.name}</span>
        <span className="truncate text-small text-text-muted">
          {pending ? "Opening…" : (person.departmentName ?? "Production team")}
        </span>
      </span>
    </button>
  );
}
