"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import type { ChatPerson, ConversationDetails, MessagingPerson } from "@/lib/domain/messages";
import {
  addGroupMembersAction,
  chatPeopleAction,
  leaveGroupAction,
  removeGroupMemberAction,
} from "../actions";
import { ChatAvatar } from "../chat-avatar";

/**
 * Who's in a chat (ADD-MSG-01, 07). For a group of chosen people, its maker (or a church-wide
 * moderator) adds and removes people, and anyone in it can leave. Everyone and department chats
 * keep themselves up to date, so they only list.
 */
export function ChatPeople({
  conversation,
  me,
  everyoneToAdd,
  onClose,
}: {
  conversation: ConversationDetails;
  me: string;
  /** People who could be added: only for someone who manages a chosen group. */
  everyoneToAdd: MessagingPerson[] | null;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<ChatPerson[] | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const chosenGroup = conversation.kind === "group" && !conversation.everyone;
  const manages = chosenGroup && everyoneToAdd !== null;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void chatPeopleAction(conversation.id).then((list) => {
      if (!cancelled) {
        setPeople(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  async function reload() {
    setPeople(await chatPeopleAction(conversation.id));
  }

  async function add(userId: string) {
    const result = await addGroupMembersAction(conversation.id, [userId]);
    setNotice(result.message);
    setQuery("");
    await reload();
  }

  async function remove(person: ChatPerson) {
    const ok = await removeGroupMemberAction(conversation.id, person.userId);
    setNotice(ok ? `${person.name} was removed.` : "That didn't work. Try again.");
    await reload();
  }

  const inChat = new Set((people ?? []).map((person) => person.userId));
  const search = query.trim().toLocaleLowerCase();
  const candidates =
    manages && search
      ? (everyoneToAdd ?? [])
          .filter(
            (person) =>
              !inChat.has(person.userId) && person.name.toLocaleLowerCase().includes(search),
          )
          .slice(0, 8)
      : [];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto flex max-h-[min(36rem,calc(100dvh-2rem))] w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 rounded-card border border-border bg-surface p-4 text-text backdrop:bg-bg/70"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-subheading font-semibold">
          People in this chat
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => dialogRef.current?.close()}
          className="flex size-10 items-center justify-center rounded-pill hover:bg-hover"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
      {conversation.kind === "department" ? (
        <p className="text-small text-text-secondary">
          Everyone in the department, on its position teams, and its leaders. Joining or leaving the
          department changes this.
        </p>
      ) : conversation.everyone ? (
        <p className="text-small text-text-secondary">
          Everyone in the Academy. New people join automatically.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-small text-text-secondary">
          {notice}
        </p>
      ) : null}
      {manages ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${titleId}-add`} className="text-small font-medium text-text-secondary">
            Add someone
          </label>
          <input
            id={`${titleId}-add`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a person"
            autoComplete="off"
            className="min-h-control rounded-button border border-border bg-card px-3 text-field placeholder:text-text-muted"
          />
          {candidates.length > 0 ? (
            <ul className="flex flex-col">
              {candidates.map((person) => (
                <li key={person.userId}>
                  <button
                    type="button"
                    onClick={() => void add(person.userId)}
                    className="flex min-h-touch w-full items-center gap-3 rounded-button px-2 text-left hover:bg-hover"
                  >
                    <ChatAvatar
                      kind="person"
                      name={person.name}
                      hue={person.departmentHue}
                      size="sm"
                    />
                    <span className="flex-1 truncate">{person.name}</span>
                    <span className="text-small font-semibold text-accent-light">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 overflow-y-auto">
        {people === null ? (
          <p role="status" className="text-small text-text-muted">
            Loading…
          </p>
        ) : (
          <ul className="flex flex-col" aria-label={`${people.length} people`}>
            {people.map((person) => (
              <li key={person.userId} className="flex min-h-touch items-center gap-3 px-1">
                <ChatAvatar kind="person" name={person.name} hue={null} size="sm" />
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  {person.name}
                  {person.userId === me ? <span className="text-text-muted">(you)</span> : null}
                  {person.isLeader ? (
                    <span className="rounded-pill bg-accent-soft px-1.5 text-[0.625rem] font-bold text-accent-light">
                      Leader
                    </span>
                  ) : null}
                </span>
                {manages && person.userId !== me ? (
                  <button
                    type="button"
                    onClick={() => void remove(person)}
                    aria-label={`Remove ${person.name}`}
                    className="rounded-button px-2 py-1 text-small font-semibold text-error hover:bg-hover"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {chosenGroup ? (
        <form action={leaveGroupAction} className="border-t border-border pt-3">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <Button type="submit" variant="destructive">
            Leave this group
          </Button>
        </form>
      ) : null}
    </dialog>
  );
}
