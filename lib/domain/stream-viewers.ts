/**
 * Livestream viewers (ADD-DASH-07). Pure rules: when to look, how often, and reading YouTube's
 * answers. The stream is public, so finding it needs only the channel and an API key.
 */
import { z } from "zod";

const MINUTE = 60_000;

/** Only look around the service itself, so the free daily quota is never wasted. */
export function inStreamWindow(startsAt: string, endsAt: string, now: number): boolean {
  return now >= Date.parse(startsAt) - 30 * MINUTE && now <= Date.parse(endsAt) + 30 * MINUTE;
}

/** A viewer count is read at most every 30 seconds, however many screens are open. */
export function viewerReadingDue(lastSampleAt: string | null, now: number): boolean {
  return lastSampleAt === null || now - Date.parse(lastSampleAt) >= 30_000;
}

/** YouTube allows about 100 searches a day, so look for the stream once a minute at most. */
export function streamSearchDue(lastSearchAt: string | null, now: number): boolean {
  return lastSearchAt === null || now - Date.parse(lastSearchAt) >= MINUTE;
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
  const query = new URLSearchParams({ part: "liveStreamingDetails", id: videoId, key: apiKey });
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
    .array(
      z.object({
        liveStreamingDetails: z
          .object({
            concurrentViewers: z.string().optional(),
            actualEndTime: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export type YoutubeReading = { live: boolean; viewers: number | null };

/**
 * How many people are watching. YouTube leaves the count out when a broadcast has no viewers, so a
 * live stream without one reads as 0. A finished stream is no longer live.
 */
export function readYoutubeVideo(answer: unknown): YoutubeReading {
  const details = videoAnswer.safeParse(answer).data?.items?.[0]?.liveStreamingDetails;
  if (!details || details.actualEndTime) {
    return { live: false, viewers: null };
  }
  const viewers = Number(details.concurrentViewers ?? 0);
  return { live: true, viewers: Number.isFinite(viewers) ? viewers : 0 };
}

export type ViewerSample = { at: string; viewers: number };

export type StreamView =
  | { status: "off" }
  | { status: "waiting" }
  | { status: "live"; viewers: number; samples: ViewerSample[] }
  | { status: "ended"; viewers: number; samples: ViewerSample[] };

/** The embed for whatever the channel is streaming, without needing that week's link. */
export function youtubeEmbedUrl(channelId: string): string {
  const query = new URLSearchParams({ channel: channelId, autoplay: "1", mute: "1" });
  return `https://www.youtube-nocookie.com/embed/live_stream?${query}`;
}

export const youtubeChannelSchema = z
  .string()
  .trim()
  .regex(/^(UC[A-Za-z0-9_-]{22})?$/);
