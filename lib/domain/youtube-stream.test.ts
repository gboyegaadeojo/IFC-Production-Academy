import { describe, expect, it } from "vitest";
import { youtubeChannelSchema, youtubeEmbedUrl } from "./youtube-stream";

describe("youtubeEmbedUrl", () => {
  it("plays whatever the channel is streaming, muted", () => {
    const url = new URL(youtubeEmbedUrl("UCfake"));
    expect(url.pathname).toBe("/embed/live_stream");
    expect(url.searchParams.get("channel")).toBe("UCfake");
    expect(url.searchParams.get("mute")).toBe("1");
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
