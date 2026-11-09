"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ActionForm, SwitchForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  CloseIcon,
  MoreHorizontalIcon,
  ReplyIcon,
  SendIcon,
  ShieldIcon,
  TrashIcon,
  WifiOffIcon,
} from "@/components/ui/icons";
import { subscribeToConversation, type LiveStatus } from "@/lib/data/messages-live";
import {
  deletedText,
  MESSAGE_MAX_LENGTH,
  mergeMessages,
  messageTime,
  threadItems,
  type ChatMessage,
  type ConversationDetails,
} from "@/lib/domain/messages";
import {
  deleteMessageAction,
  fetchMessagesAction,
  markReadAction,
  renameGroupAction,
  sendMessageAction,
  setMutedAction,
} from "../actions";
import { ChatAvatar } from "../chat-avatar";

type Pending = {
  clientId: string;
  body: string;
  replyTo: ChatMessage | null;
  state: "sending" | "failed";
};

/** The newest time the page has seen a message sent, for catching up. */
function latest(messages: readonly ChatMessage[]): string | null {
  return messages.at(-1)?.createdAt ?? null;
}

/**
 * One chat (ADD-MSG-01 to 03; option C, approved 2026-11-08). New messages arrive live while it's
 * open and visible; it stops listening when you leave or hide the tab, and catches up on return.
 * Sending is safe to retry: each message keeps its own id until the server has it.
 */
export function ChatThread({
  conversation,
  initialMessages,
  me,
  nowIso,
  supabaseUrl,
  publishableKey,
}: {
  conversation: ConversationDetails;
  initialMessages: ChatMessage[];
  me: string;
  nowIso: string;
  supabaseUrl: string;
  publishableKey: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null);
  const [live, setLive] = useState<LiveStatus>("connecting");
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const conversationId = conversation.id;

  const pendingRef = useRef(pending);
  useEffect(() => {
    messagesRef.current = messages;
    pendingRef.current = pending;
  }, [messages, pending]);

  const catchUp = useCallback(async () => {
    const fresh = await fetchMessagesAction(conversationId, latest(messagesRef.current));
    if (fresh.length > 0) {
      setMessages((current) => mergeMessages(current, fresh));
    }
    if (document.visibilityState === "visible") {
      void markReadAction(conversationId);
    }
  }, [conversationId]);

  // Read on opening, then refresh the list so its unread count clears.
  useEffect(() => {
    void markReadAction(conversationId).then(() => router.refresh());
  }, [conversationId, router]);

  // Live while visible; nothing held open in a hidden tab (free plan: 200 connections).
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const start = () => {
      unsubscribe ??= subscribeToConversation({
        url: supabaseUrl,
        publishableKey,
        conversationId,
        onChange: () => void catchUp(),
        onStatus: (status) => {
          setLive(status);
          if (status === "live") {
            void catchUp();
          }
        },
      });
    };
    const stop = () => {
      unsubscribe?.();
      unsubscribe = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") {
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    // A safety net if the live connection drops quietly: one small check every 15 seconds while
    // the chat is on screen.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void catchUp();
      }
    }, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      stop();
    };
  }, [conversationId, supabaseUrl, publishableKey, catchUp]);

  const send = useCallback(
    async (item: Pending) => {
      setPending((current) =>
        current.map((p) => (p.clientId === item.clientId ? { ...p, state: "sending" } : p)),
      );
      const result = await sendMessageAction({
        conversationId,
        clientId: item.clientId,
        body: item.body,
        replyTo: item.replyTo?.id ?? null,
        after: latest(messagesRef.current),
      }).catch(() => ({ ok: false as const, message: "That didn't send. Check your connection." }));
      if (result.ok) {
        setPending((current) => current.filter((p) => p.clientId !== item.clientId));
        setMessages((current) => mergeMessages(current, result.messages));
      } else {
        setPending((current) =>
          current.map((p) => (p.clientId === item.clientId ? { ...p, state: "failed" } : p)),
        );
        setNotice(result.message);
      }
    },
    [conversationId],
  );

  // Offline: say so, keep what's written, and send it when the connection's back.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void catchUp();
      for (const item of pendingRef.current) {
        if (item.state === "failed") {
          void send(item);
        }
      }
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [catchUp, send]);

  // Keep the newest message in view.
  const count = messages.length + pending.length;
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [count]);

  useEffect(() => {
    if (toDelete) {
      dialogRef.current?.showModal();
    }
  }, [toDelete]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || body.length > MESSAGE_MAX_LENGTH) {
      return;
    }
    const item: Pending = { clientId: crypto.randomUUID(), body, replyTo, state: "sending" };
    setPending((current) => [...current, item]);
    setDraft("");
    setReplyTo(null);
    setNotice(null);
    if (navigator.onLine) {
      void send(item);
    } else {
      setPending((current) =>
        current.map((p) => (p.clientId === item.clientId ? { ...p, state: "failed" } : p)),
      );
    }
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on a computer; phones keep Enter for a new line and use the Send button.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      event.preventDefault();
      submit();
    }
  }

  async function confirmDelete() {
    const message = toDelete;
    dialogRef.current?.close();
    setToDelete(null);
    if (!message) {
      return;
    }
    if (await deleteMessageAction(message.id)) {
      await catchUp();
    } else {
      setNotice("That didn't delete. Try again.");
    }
  }

  const items = threadItems(messages, me, now);
  const subtitle =
    conversation.kind === "direct"
      ? "Direct message"
      : `${conversation.memberCount} ${conversation.memberCount === 1 ? "person" : "people"}${
          conversation.kind === "department"
            ? " · members, position team and leaders"
            : conversation.everyone
              ? " · everyone in the Academy"
              : ""
        }`;
  const isOffline = !online || live === "offline";

  return (
    <section
      aria-labelledby={titleId}
      data-live={live}
      className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] min-h-0 flex-col md:h-dvh"
    >
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5">
        <Link
          href="/messages"
          aria-label="Back to chats"
          className="flex size-10 shrink-0 items-center justify-center rounded-pill hover:bg-hover md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        <ChatAvatar
          kind={conversation.kind}
          name={conversation.title}
          hue={conversation.departmentHue}
          icon={conversation.departmentIcon}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <h1 id={titleId} className="truncate font-semibold">
            {conversation.title}
          </h1>
          <span className="truncate text-small text-text-muted">{subtitle}</span>
        </span>
        <ChatSettings conversation={conversation} />
      </header>

      {conversation.kind === "direct" ? (
        <p className="mx-3 mt-2 flex items-center gap-2 rounded-card bg-accent-soft px-3 py-2 text-small text-accent-light">
          <ShieldIcon className="size-4 shrink-0" />
          The Production Director and Platform Admins can read direct messages to keep everyone
          safe.
        </p>
      ) : null}
      {isOffline ? (
        <p
          role="status"
          className="mx-3 mt-2 flex items-start gap-2 rounded-card bg-warning-soft px-3 py-2 text-small"
        >
          <WifiOffIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>You&apos;re offline.</strong> Messages you write will send when you&apos;re
            back.
          </span>
        </p>
      ) : null}

      <div
        ref={listRef}
        role="log"
        aria-label={`Messages in ${conversation.title}`}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto bg-bg px-3 py-3"
      >
        {items.length === 0 && pending.length === 0 ? (
          <div className="m-auto flex max-w-xs flex-col items-center gap-1 text-center">
            <h2 className="font-semibold">No messages yet</h2>
            <p className="text-small text-text-secondary">
              Say hello, or ask a question before Sunday.
            </p>
          </div>
        ) : null}
        {items.map((item) =>
          item.type === "day" ? (
            <p key={item.key} className="my-2 text-center text-[0.75rem] text-text-muted">
              {item.label}
            </p>
          ) : (
            <MessageRow
              key={item.key}
              message={item.message}
              mine={item.mine}
              startsGroup={item.startsGroup}
              canDelete={!item.message.deletedAt && (item.mine || conversation.canModerate)}
              menuOpen={menuFor === item.message.id}
              onMenu={() => setMenuFor(menuFor === item.message.id ? null : item.message.id)}
              onReply={() => {
                setReplyTo(item.message);
                setMenuFor(null);
                inputRef.current?.focus();
              }}
              onDelete={() => {
                setToDelete(item.message);
                setMenuFor(null);
              }}
            />
          ),
        )}
        {pending.map((item) => (
          <div key={item.clientId} className="flex flex-col items-end gap-1 self-end">
            <p className="max-w-[min(32rem,85%)] rounded-[1rem_1rem_0.375rem_1rem] bg-accent-soft px-3.5 py-2 [overflow-wrap:anywhere] whitespace-pre-wrap opacity-70">
              {item.body}
            </p>
            {item.state === "failed" ? (
              <span className="flex items-center gap-2 text-[0.75rem] text-error">
                {online ? "Not sent." : "Waiting to send."}
                {online ? (
                  <button
                    type="button"
                    onClick={() => void send(item)}
                    className="font-semibold underline underline-offset-2"
                  >
                    Try again
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="text-[0.75rem] text-text-muted">Sending…</span>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-2 border-t border-border bg-surface px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        {notice ? (
          <p role="alert" className="text-small text-error">
            {notice}
          </p>
        ) : null}
        {replyTo ? (
          <div className="flex items-center gap-2 rounded-card border-l-4 border-accent bg-card px-3 py-1.5 text-small">
            <span className="min-w-0 flex-1 truncate">
              Replying to <strong>{replyTo.senderName}</strong>: {replyTo.body}
            </span>
            <button
              type="button"
              aria-label="Stop replying"
              onClick={() => setReplyTo(null)}
              className="flex size-8 items-center justify-center rounded-pill hover:bg-hover"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <label htmlFor={`${titleId}-draft`} className="sr-only">
            Message
          </label>
          <textarea
            id={`${titleId}-draft`}
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={isOffline ? "You're offline. This will send when you're back." : "Message"}
            className="[field-sizing:content] max-h-40 min-h-11 flex-1 resize-none rounded-[1.375rem] border border-border bg-card px-4 py-2.5 text-field placeholder:text-text-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-accent text-on-accent transition-surface disabled:opacity-45"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </form>

      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby={`${titleId}-delete`}
        onClose={() => setToDelete(null)}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-5 text-text backdrop:bg-bg/70"
      >
        <h2 id={`${titleId}-delete`} className="text-subheading font-semibold">
          Delete this message?
        </h2>
        <p className="mt-2 text-text-secondary">
          {toDelete && toDelete.senderId !== me
            ? "It's removed for everyone in this chat, and the chat shows that a leader deleted it."
            : "It's removed for everyone in this chat."}{" "}
          The audit log records who deleted it and when, not what it said.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </div>
      </dialog>
    </section>
  );
}

function MessageRow({
  message,
  mine,
  startsGroup,
  canDelete,
  menuOpen,
  onMenu,
  onReply,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  startsGroup: boolean;
  canDelete: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const deleted = message.deletedAt !== null;
  return (
    <div
      className={`group relative flex max-w-[min(36rem,88%)] items-end gap-2 ${
        mine ? "flex-row-reverse self-end" : "self-start"
      } ${startsGroup ? "mt-2" : ""}`}
    >
      {!mine ? (
        startsGroup ? (
          <ChatAvatar kind="person" name={message.senderName} hue={null} size="sm" />
        ) : (
          <span className="w-8 shrink-0" aria-hidden="true" />
        )
      ) : null}
      <div className={`flex min-w-0 flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
        {!mine && startsGroup ? (
          <span className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-text-secondary">
            {message.senderName}
            {message.senderIsLeader ? (
              <span className="rounded-pill bg-accent-soft px-1.5 text-[0.625rem] font-bold text-accent-light">
                Leader
              </span>
            ) : null}
          </span>
        ) : null}
        {message.replyTo && !deleted ? (
          <span className="max-w-full truncate rounded-[0.375rem] border-l-[3px] border-accent bg-card px-2.5 py-1 text-[0.75rem] text-text-secondary">
            <strong>{message.replyTo.senderName}</strong>{" "}
            {message.replyTo.body ?? "Message deleted"}
          </span>
        ) : null}
        {deleted ? (
          <p className="flex items-center gap-1.5 rounded-[1rem] border border-dashed border-border-strong px-3.5 py-2 text-small text-text-muted italic">
            <TrashIcon className="size-3.5" />
            {deletedText(message, mine)}
          </p>
        ) : (
          <p
            className={`px-3.5 py-2 [overflow-wrap:anywhere] whitespace-pre-wrap ${
              mine
                ? "rounded-[1rem_1rem_0.375rem_1rem] bg-accent-soft"
                : "rounded-[1rem_1rem_1rem_0.375rem] border border-border bg-surface"
            }`}
          >
            {message.body}
          </p>
        )}
        <time
          dateTime={message.createdAt}
          suppressHydrationWarning
          className="text-[0.6875rem] text-text-muted"
        >
          {messageTime(message.createdAt)}
        </time>
      </div>
      {!deleted ? (
        <div className="relative self-center">
          <button
            type="button"
            aria-label={`Actions for ${mine ? "your" : `${message.senderName}'s`} message`}
            aria-expanded={menuOpen}
            onClick={onMenu}
            className="flex size-8 items-center justify-center rounded-pill text-text-muted opacity-100 hover:bg-hover hover:text-text md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:aria-expanded:opacity-100"
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
          {menuOpen ? (
            <div
              className={`absolute top-full z-10 mt-1 flex w-48 flex-col rounded-card border border-border bg-surface p-1 shadow-[var(--shadow-lift)] ${
                mine ? "right-0" : "left-0"
              }`}
            >
              <button
                type="button"
                onClick={onReply}
                className="flex min-h-touch items-center gap-2.5 rounded-button px-2.5 text-left hover:bg-hover"
              >
                <ReplyIcon className="size-4" />
                Reply
              </button>
              {canDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex min-h-touch items-center gap-2.5 rounded-button px-2.5 text-left text-error hover:bg-hover"
                >
                  <TrashIcon className="size-4" />
                  Delete message
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Mute, and for a group's maker, rename. */
function ChatSettings({ conversation }: { conversation: ConversationDetails }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Chat settings"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="flex size-10 items-center justify-center rounded-pill text-text-secondary hover:bg-hover"
      >
        <MoreHorizontalIcon className="size-5" />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full right-0 z-20 mt-2 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-3 rounded-card border border-border bg-surface p-3.5 shadow-[var(--shadow-lift)]"
      >
        <SwitchForm
          action={setMutedAction}
          hidden={{ conversationId: conversation.id }}
          name="muted"
          checked={conversation.muted}
          label="Mute notifications"
        />
        {conversation.canRename ? (
          <ActionForm
            action={renameGroupAction}
            submitLabel="Rename"
            pendingLabel="Saving…"
            hidden={{ conversationId: conversation.id }}
            className="flex flex-col gap-2"
            buttonClassName="rounded-pill"
          >
            <label className="flex flex-col gap-1 text-small text-text-secondary">
              Group name
              <input
                name="title"
                defaultValue={conversation.title}
                maxLength={60}
                required
                className="min-h-control rounded-button border border-border-strong bg-surface px-3 text-field text-text"
              />
            </label>
          </ActionForm>
        ) : null}
      </div>
    </div>
  );
}
