import { describe, expect, it } from "vitest";
import { messageAlert, messageAlertTag } from "./message-alerts";

const base = {
  conversationId: "c1",
  kind: "department",
  chatName: "Camera Operations",
  senderName: "Jordan Lee",
  preview: "Doors at 9:15",
  attachmentKind: null,
  unreadCount: 1,
};

describe("messageAlert", () => {
  it("says how many are waiting in a chat, with a short preview", () => {
    expect(messageAlert(base)).toEqual({
      title: "1 new message in Camera Operations",
      body: "Jordan: Doors at 9:15",
      url: "/messages/c1",
      tag: "chat-c1",
    });
    expect(messageAlert({ ...base, unreadCount: 4 }).title).toBe(
      "4 new messages in Camera Operations",
    );
  });

  it("uses one tag per chat, so a new alert replaces the old one", () => {
    expect(messageAlert({ ...base, unreadCount: 2 }).tag).toBe(messageAlert(base).tag);
    expect(messageAlertTag("c2")).not.toBe(messageAlertTag("c1"));
  });

  it("says what a message without words carried", () => {
    expect(messageAlert({ ...base, preview: "", attachmentKind: "photo" }).body).toBe(
      "Jordan: Photo",
    );
    expect(messageAlert({ ...base, preview: null, attachmentKind: null }).body).toBe(
      "Jordan: New message",
    );
  });

  it("never shows a direct message's words", () => {
    const alert = messageAlert({
      ...base,
      kind: "direct",
      preview: "Private words",
      unreadCount: 2,
    });
    expect(alert.title).toBe("2 new messages from Jordan Lee");
    expect(alert.body).toBe("Open Messages to read them.");
    expect(JSON.stringify(alert)).not.toContain("Private");
  });

  it("keeps alerts short", () => {
    const long = messageAlert({ ...base, preview: "x".repeat(500) });
    expect(long.body.length).toBeLessThanOrEqual(160);
  });
});
