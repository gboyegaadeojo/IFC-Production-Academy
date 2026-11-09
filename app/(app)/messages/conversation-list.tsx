"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PencilIcon } from "@/components/ui/icons";
import { badgeLabel, type ConversationKind } from "@/lib/domain/messages";
import { ChatAvatar } from "./chat-avatar";

export type ListRow = {
  id: string;
  kind: ConversationKind;
  title: string;
  hue: string | null;
  icon: string | null;
  preview: string;
  time: string | null;
  unread: number;
  muted: boolean;
};

const SECTIONS: { kind: ConversationKind; label: string }[] = [
  { kind: "group", label: "Group chats" },
  { kind: "department", label: "Department chats" },
  { kind: "direct", label: "Direct messages" },
];

/**
 * The chat list (option C, approved 2026-11-08): search, then group chats, department chats, and
 * direct messages, each with its last message, time, and unread count. On phones it's the whole
 * page; from 768px it sits beside the open chat.
 */
export function ConversationList({ rows }: { rows: ListRow[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const shown = rows.filter(
    (row) =>
      !search ||
      row.title.toLocaleLowerCase().includes(search) ||
      row.preview.toLocaleLowerCase().includes(search),
  );

  return (
    <div className="flex flex-col gap-2 px-3 pt-3 pb-6">
      <div className="flex items-center justify-between gap-2 px-1">
        <h1 className="text-[1.375rem] font-bold tracking-tight">Messages</h1>
        <Link
          href="/messages/new"
          aria-label="New message"
          title="New message"
          className="flex size-10 items-center justify-center rounded-pill bg-accent-soft text-accent-light transition-surface hover:brightness-105"
        >
          <PencilIcon className="size-5" />
        </Link>
      </div>
      <label className="sr-only" htmlFor="chat-search">
        Search chats
      </label>
      <input
        id="chat-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search chats"
        autoComplete="off"
        className="mx-1 min-h-control rounded-button border border-border bg-card px-3 text-field placeholder:text-text-muted"
      />
      {rows.length === 0 ? (
        <p className="px-1 py-6 text-text-secondary">
          No chats yet. Your department&apos;s chat appears when you join one, or start a direct
          message with the pencil.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-1 py-6 text-text-secondary">Nothing matches that.</p>
      ) : (
        SECTIONS.map((section) => {
          const items = shown.filter((row) => row.kind === section.kind);
          return items.length === 0 ? null : (
            <section key={section.kind} aria-labelledby={`chats-${section.kind}`}>
              <h2
                id={`chats-${section.kind}`}
                className="mt-3 mb-1 px-1 text-[0.6875rem] font-bold tracking-[0.06em] text-text-muted uppercase"
              >
                {section.label}
              </h2>
              <ul className="flex flex-col">
                {items.map((row) => {
                  const current = pathname === `/messages/${row.id}`;
                  return (
                    <li key={row.id}>
                      <Link
                        href={`/messages/${row.id}`}
                        aria-current={current ? "page" : undefined}
                        className={`flex min-h-16 items-center gap-3 rounded-card px-2 py-2 transition-surface ${
                          current ? "bg-accent-soft" : "hover:bg-hover"
                        }`}
                      >
                        <ChatAvatar
                          kind={row.kind}
                          name={row.title}
                          hue={row.hue}
                          icon={row.icon}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold">{row.title}</span>
                          <span
                            className={`truncate text-small ${row.unread > 0 ? "text-text-secondary" : "text-text-muted"}`}
                          >
                            {row.preview}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {row.time ? (
                            <span
                              className={`text-[0.6875rem] ${row.unread > 0 && !row.muted ? "font-semibold text-accent-light" : "text-text-muted"}`}
                            >
                              {row.time}
                            </span>
                          ) : null}
                          {row.unread > 0 ? (
                            <span
                              className={`flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-[0.6875rem] font-bold ${
                                row.muted ? "bg-card text-text-muted" : "bg-accent text-on-accent"
                              }`}
                            >
                              {badgeLabel(row.unread)}
                              <span className="sr-only"> unread{row.muted ? ", muted" : ""}</span>
                            </span>
                          ) : row.muted ? (
                            <span className="text-[0.6875rem] text-text-muted">Muted</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
