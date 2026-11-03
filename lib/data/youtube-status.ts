import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/data/database.types";
import {
  inStreamWindow,
  liveCheckDue,
  readYoutubeSearch,
  readYoutubeVideoLive,
  streamSearchDue,
  type YoutubeStatus,
  youtubeSearchUrl,
  youtubeVideoUrl,
} from "@/lib/domain/youtube-stream";

const stateSchema = z.object({
  channel: z.string().nullable(),
  videoId: z.string().nullable(),
  live: z.boolean(),
  lastSearchAt: z.string().nullable(),
  checkedAt: z.string().nullable(),
});

/** One read from YouTube. Null on any failure. Logs nothing. */
async function youtube(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Whether the channel is live (ADD-DASH-07). Whichever screen is open during a service keeps it
 * current, with one check every 30 seconds at most between them. The key stays on the server, and
 * nothing here can take the page down.
 */
export async function getYoutubeStatus(
  supabase: SupabaseClient<Database>,
  event: { id: string; startsAt: string; endsAt: string },
  screenToken: string | null,
  now: number,
): Promise<YoutubeStatus> {
  try {
    const { data, error } = await supabase.rpc("service_youtube_state", {
      p_event_id: event.id,
      p_screen_token: screenToken,
    });
    const state = error ? null : stateSchema.safeParse(data).data;
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!state || !apiKey || !state.channel) {
      return "off";
    }
    if (!inStreamWindow(event.startsAt, event.endsAt, now)) {
      return "not_live";
    }
    if (!liveCheckDue(state.checkedAt, now)) {
      return state.live ? "live" : "not_live";
    }

    let videoId = state.videoId;
    let live = false;
    let searched = false;
    if (videoId) {
      live = readYoutubeVideoLive(await youtube(youtubeVideoUrl(videoId, apiKey)));
      // A stream that ended may start again as a new video.
      videoId = live ? videoId : null;
    } else if (streamSearchDue(state.lastSearchAt, now)) {
      searched = true;
      videoId = readYoutubeSearch(await youtube(youtubeSearchUrl(state.channel, apiKey)));
      live = videoId !== null;
    }
    await supabase.rpc("save_youtube_check", {
      p_event_id: event.id,
      p_video_id: videoId,
      p_live: live,
      p_searched: searched,
      p_screen_token: screenToken,
    });
    return live ? "live" : "not_live";
  } catch {
    return "off";
  }
}
