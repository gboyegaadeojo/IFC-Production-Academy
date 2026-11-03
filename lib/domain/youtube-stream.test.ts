import { describe, expect, it } from "vitest";
import {
  inStreamWindow,
  liveCheckDue,
  readYoutubeSearch,
  readYoutubeVideoLive,
  streamSearchDue,
  youtubeChannelSchema,
  youtubeEmbedUrl,
  youtubeSearchUrl,
  youtubeVideoUrl,
} from "./youtube-stream";

const START = "2026-11-08T16:00:00Z";
const END = "2026-11-08T17:30:00Z";
const at = (iso: string) => Date.parse(iso);

describe("inStreamWindow", () => {
  it("looks from 30 minutes before until 30 minutes after", () => {
    expect(inStreamWindow(START, END, at("2026-11-08T15:29:00Z"))).toBe(false);
    expect(inStreamWindow(START, END, at("2026-11-08T15:31:00Z"))).toBe(true);
    expect(inStreamWindow(START, END, at("2026-11-08T17:59:00Z"))).toBe(true);
    expect(inStreamWindow(START, END, at("2026-11-08T18:01:00Z"))).toBe(false);
  });
});

describe("how often it looks", () => {
  const last = "2026-11-08T16:00:00Z";

  it("checks every 30 seconds at most", () => {
    expect(liveCheckDue(null, at(last))).toBe(true);
    expect(liveCheckDue(last, at("2026-11-08T16:00:29Z"))).toBe(false);
    expect(liveCheckDue(last, at("2026-11-08T16:00:30Z"))).toBe(true);
  });

  it("searches every 2 minutes at most", () => {
    expect(streamSearchDue(null, at(last))).toBe(true);
    expect(streamSearchDue(last, at("2026-11-08T16:01:59Z"))).toBe(false);
    expect(streamSearchDue(last, at("2026-11-08T16:02:00Z"))).toBe(true);
  });
});

describe("addresses", () => {
  it("searches the channel for a live video", () => {
    const url = new URL(youtubeSearchUrl("UCfake", "key"));
    expect(url.searchParams.get("channelId")).toBe("UCfake");
    expect(url.searchParams.get("eventType")).toBe("live");
  });

  it("reads one video", () => {
    expect(new URL(youtubeVideoUrl("abc", "key")).searchParams.get("id")).toBe("abc");
  });

  it("plays whatever the channel is streaming, muted", () => {
    const url = new URL(youtubeEmbedUrl("UCfake"));
    expect(url.pathname).toBe("/embed/live_stream");
    expect(url.searchParams.get("channel")).toBe("UCfake");
    expect(url.searchParams.get("mute")).toBe("1");
  });
});

describe("readYoutubeSearch", () => {
  it("finds the live video", () => {
    expect(readYoutubeSearch({ items: [{ id: { videoId: "abc" } }] })).toBe("abc");
  });

  it.each([[{ items: [] }], [{}], [null], ["odd"], [{ items: [{ id: {} }] }]])(
    "finds nothing in %j",
    (answer) => {
      expect(readYoutubeSearch(answer)).toBeNull();
    },
  );
});

describe("readYoutubeVideoLive", () => {
  it("is live only while YouTube says so", () => {
    const video = (liveBroadcastContent: string) => ({
      items: [{ snippet: { liveBroadcastContent } }],
    });
    expect(readYoutubeVideoLive(video("live"))).toBe(true);
    expect(readYoutubeVideoLive(video("none"))).toBe(false);
    expect(readYoutubeVideoLive(video("upcoming"))).toBe(false);
  });

  it.each([[{ items: [] }], [{}], [null], ["odd"]])("is not live for %j", (answer) => {
    expect(readYoutubeVideoLive(answer)).toBe(false);
  });
});

describe("youtubeChannelSchema", () => {
  it("accepts a channel id, or nothing to clear it", () => {
    expect(youtubeChannelSchema.safeParse("UCaaaaaaaaaaaaaaaaaaaaaa").success).toBe(true);
    expect(youtubeChannelSchema.safeParse(" ").success).toBe(true);
  });

  it.each(["https://youtube.com/@fake", "UCshort", "<script>"])("refuses %s", (value) => {
    expect(youtubeChannelSchema.safeParse(value).success).toBe(false);
  });
});
