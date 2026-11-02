import { describe, expect, it } from "vitest";
import {
  inStreamWindow,
  readYoutubeSearch,
  readYoutubeVideo,
  streamSearchDue,
  viewerReadingDue,
  youtubeChannelSchema,
  youtubeEmbedUrl,
  youtubeSearchUrl,
  youtubeVideoUrl,
} from "./stream-viewers";

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

describe("how often it reads", () => {
  const now = at(START);

  it("reads viewers every 30 seconds at most", () => {
    expect(viewerReadingDue(null, now)).toBe(true);
    expect(viewerReadingDue(new Date(now - 29_000).toISOString(), now)).toBe(false);
    expect(viewerReadingDue(new Date(now - 30_000).toISOString(), now)).toBe(true);
  });

  it("searches once a minute at most, to stay inside YouTube's daily search limit", () => {
    expect(streamSearchDue(null, now)).toBe(true);
    expect(streamSearchDue(new Date(now - 59_000).toISOString(), now)).toBe(false);
    expect(streamSearchDue(new Date(now - 60_000).toISOString(), now)).toBe(true);
  });
});

describe("addresses", () => {
  it("asks for live video on the channel", () => {
    const url = new URL(youtubeSearchUrl("UCfake", "key"));
    expect(url.searchParams.get("eventType")).toBe("live");
    expect(url.searchParams.get("type")).toBe("video");
    expect(url.searchParams.get("channelId")).toBe("UCfake");
  });

  it("asks for the live viewer count", () => {
    const url = new URL(youtubeVideoUrl("vid", "key"));
    expect(url.searchParams.get("part")).toBe("liveStreamingDetails");
  });

  it("embeds the channel's live stream, muted, so no weekly link is needed", () => {
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

describe("readYoutubeVideo", () => {
  it("reads the count, which YouTube sends as text", () => {
    expect(
      readYoutubeVideo({ items: [{ liveStreamingDetails: { concurrentViewers: "427" } }] }),
    ).toEqual({ live: true, viewers: 427 });
  });

  it("reads a live stream with no count as 0, since YouTube leaves it out", () => {
    expect(readYoutubeVideo({ items: [{ liveStreamingDetails: {} }] })).toEqual({
      live: true,
      viewers: 0,
    });
  });

  it("says a finished stream isn't live", () => {
    expect(
      readYoutubeVideo({
        items: [{ liveStreamingDetails: { actualEndTime: "2026-11-08T17:00:00Z" } }],
      }),
    ).toEqual({ live: false, viewers: null });
  });

  it.each([[{ items: [] }], [{}], [null]])("copes with %j", (answer) => {
    expect(readYoutubeVideo(answer)).toEqual({ live: false, viewers: null });
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
