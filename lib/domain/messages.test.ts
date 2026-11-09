import { describe, expect, it } from "vitest";
import {
  avatarInitials,
  badgeLabel,
  conversationPreview,
  dayLabel,
  deletedText,
  listTime,
  mergeMessages,
  messageBodySchema,
  threadItems,
  unreadTotal,
  type ChatMessage,
  type ConversationSummary,
} from "./messages";

const chat: ConversationSummary = {
  id: "c1",
  kind: "department",
  title: "Camera Operations",
  departmentHue: "blue",
  departmentIcon: "camera",
  everyone: false,
  lastMessageAt: "2026-11-08T15:33:00Z",
  lastBody: "Thanks Taylor.\nThe spare plate is in the grey case.",
  lastSenderName: "Jordan Lee",
  lastMine: false,
  lastDeleted: false,
  unread: 3,
  muted: false,
};

function message(id: string, senderId: string, createdAt: string): ChatMessage {
  return {
    id,
    senderId,
    senderName: senderId,
    senderIsLeader: false,
    body: "Fake",
    replyTo: null,
    createdAt,
    deletedAt: null,
    deletedByOther: false,
  };
}

describe("conversationPreview", () => {
  it("names the sender by first name in group chats", () => {
    expect(conversationPreview(chat)).toBe(
      "Jordan: Thanks Taylor. The spare plate is in the grey case.",
    );
  });

  it("says You for your own, and no name in a direct message", () => {
    expect(conversationPreview({ ...chat, lastMine: true })).toMatch(/^You: /);
    expect(conversationPreview({ ...chat, kind: "direct" })).toMatch(/^Thanks Taylor/);
  });

  it("covers empty and deleted", () => {
    expect(conversationPreview({ ...chat, lastMessageAt: null })).toBe("No messages yet");
    expect(conversationPreview({ ...chat, lastDeleted: true })).toBe("Message deleted");
  });
});

describe("unread", () => {
  it("leaves muted chats out of the total", () => {
    expect(unreadTotal([chat, { ...chat, unread: 2, muted: true }, { ...chat, unread: 1 }])).toBe(
      4,
    );
  });

  it("caps the badge", () => {
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(120)).toBe("99+");
  });
});

describe("dates, in Winnipeg time", () => {
  const now = new Date("2026-11-08T18:00:00Z");

  it("labels days", () => {
    expect(dayLabel("2026-11-08T15:00:00Z", now)).toBe("Today");
    expect(dayLabel("2026-11-07T15:00:00Z", now)).toBe("Yesterday");
    // 03:00 UTC on Nov 8 is still Nov 7 in Winnipeg.
    expect(dayLabel("2026-11-08T03:00:00Z", now)).toBe("Yesterday");
  });

  it("shortens times in the list", () => {
    expect(listTime("2026-11-07T15:00:00Z", now)).toBe("Yesterday");
    expect(listTime("2026-10-30T15:00:00Z", now)).toBe("Oct 30");
  });
});

describe("threadItems", () => {
  const now = new Date("2026-11-08T18:00:00Z");

  it("adds day dividers and groups a sender's messages within five minutes", () => {
    const items = threadItems(
      [
        message("1", "riley", "2026-11-07T15:00:00Z"),
        message("2", "riley", "2026-11-08T15:00:00Z"),
        message("3", "riley", "2026-11-08T15:03:00Z"),
        message("4", "riley", "2026-11-08T15:20:00Z"),
        message("5", "me", "2026-11-08T15:21:00Z"),
      ],
      "me",
      now,
    );
    expect(items.map((item) => (item.type === "day" ? item.label : item.startsGroup))).toEqual([
      "Yesterday",
      true,
      "Today",
      true,
      false,
      true,
      true,
    ]);
    expect(items.at(-1)).toMatchObject({ type: "message", mine: true });
  });
});

describe("messages", () => {
  it("trims, and refuses empty or too long", () => {
    expect(messageBodySchema.parse("  hi  ")).toBe("hi");
    expect(messageBodySchema.safeParse("   ").success).toBe(false);
    expect(messageBodySchema.safeParse("x".repeat(4001)).success).toBe(false);
  });

  it("says who deleted a message", () => {
    const deleted = { ...message("1", "me", "2026-11-08T15:00:00Z"), deletedAt: "x" };
    expect(deletedText(deleted, true)).toBe("You deleted this message");
    expect(deletedText({ ...deleted, deletedByOther: true }, false)).toBe(
      "Message deleted by a leader",
    );
    expect(deletedText(deleted, false)).toBe("Message deleted");
  });

  it("merges live updates by id, oldest first", () => {
    const a = message("a", "x", "2026-11-08T15:00:00Z");
    const b = message("b", "x", "2026-11-08T15:01:00Z");
    expect(mergeMessages([b], [a, { ...b, body: null }]).map((m) => [m.id, m.body])).toEqual([
      ["a", "Fake"],
      ["b", null],
    ]);
  });

  it("makes initials", () => {
    expect(avatarInitials("Jordan Lee")).toBe("JL");
    expect(avatarInitials("riley")).toBe("RI");
    expect(avatarInitials(" ")).toBe("?");
  });
});
