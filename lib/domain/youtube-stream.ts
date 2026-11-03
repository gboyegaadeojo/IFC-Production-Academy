/** The YouTube live stream on the Service Dashboard (ADD-DASH-07). It needs only the channel. */
import { z } from "zod";

/** The embed for whatever the channel is streaming, without needing that week's link. */
export function youtubeEmbedUrl(channelId: string): string {
  const query = new URLSearchParams({ channel: channelId, autoplay: "1", mute: "1" });
  return `https://www.youtube-nocookie.com/embed/live_stream?${query}`;
}

export const youtubeChannelSchema = z
  .string()
  .trim()
  .regex(/^(UC[A-Za-z0-9_-]{22})?$/);
