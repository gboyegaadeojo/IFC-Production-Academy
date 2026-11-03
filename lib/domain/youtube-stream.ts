/**
 * YouTube on the Service Dashboard (ADD-DASH-07). Pure rules: when to look, and reading YouTube's
 * answers. The stream is public, so finding it needs only the channel and an API key.
 */
import { z } from "zod";

const MINUTE = 60_000;

/** Only look around the service itself, so the free daily quota is never wasted. */
export function inStreamWindow(startsAt: string, endsAt: string, now: number): boolean {
  return now >= Date.parse(startsAt) - 30 * MINUTE && now <= Date.parse(endsAt) + 30 * MINUTE;
}

/** The answer is good for 30 seconds, however many screens are open. */
export function liveCheckDue(checkedAt: string | null, now: number): boolean {
  return checkedAt === null || now - Date.parse(checkedAt) >= 30_000;
}

/** YouTube allows about 100 searches a day, so look for the stream every 2 minutes at most. */
export function streamSearchDue(lastSearchAt: string | null, now: number): boolean {
  return lastSearchAt === null || now - Date.parse(lastSearchAt) >= 2 * MINUTE;
}

export function youtubeSearchUrl(channelId: string, apiKey: string): string {
  const query = new URLSearchParams({
    part: "id",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "1",
    key: apiKey,
  });
  return `https://www.googleapis.com/youtube/v3/search?${query}`;
}

export function youtubeVideoUrl(videoId: string, apiKey: string): string {
  const query = new URLSearchParams({ part: "snippet", id: videoId, key: apiKey });
  return `https://www.googleapis.com/youtube/v3/videos?${query}`;
}

const searchAnswer = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string().min(1) }) })).optional(),
});

/** The live video on the channel, if there is one. */
export function readYoutubeSearch(answer: unknown): string | null {
  return searchAnswer.safeParse(answer).data?.items?.[0]?.id.videoId ?? null;
}

const videoAnswer = z.object({
  items: z
    .array(z.object({ snippet: z.object({ liveBroadcastContent: z.string() }).optional() }))
    .optional(),
});

/** Whether that video is still live. A finished stream isn't. */
export function readYoutubeVideoLive(answer: unknown): boolean {
  return videoAnswer.safeParse(answer).data?.items?.[0]?.snippet?.liveBroadcastContent === "live";
}

export type YoutubeStatus = "off" | "live" | "not_live";

/** The embed for whatever the channel is streaming, without needing that week's link. */
export function youtubeEmbedUrl(channelId: string): string {
  const query = new URLSearchParams({ channel: channelId, autoplay: "1", mute: "1" });
  return `https://www.youtube-nocookie.com/embed/live_stream?${query}`;
}

export const youtubeChannelSchema = z
  .string()
  .trim()
  .regex(/^(UC[A-Za-z0-9_-]{22})?$/);
