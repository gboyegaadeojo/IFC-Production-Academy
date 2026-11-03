import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/data/database.types";
import {
  inStreamWindow,
  readYoutubeSearch,
  readYoutubeVideo,
  streamSearchDue,
  type StreamView,
  viewerReadingDue,
  youtubeSearchUrl,
  youtubeVideoUrl,
} from "@/lib/domain/stream-viewers";

const stateSchema = z.object({
  channel: z.string().nullable(),
  externalId: z.string().nullable(),
  lastSearchAt: z.string().nullable(),
  samples: z.array(z.object({ at: z.string(), viewers: z.number() })),
});

/** One read from YouTube. Null on any failure: the tile keeps its last number. Logs nothing. */
async function youtube(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * The YouTube tile's numbers (ADD-DASH-07). Whichever screen is open during a service keeps them
 * current, with one read every 30 seconds at most between them. The key stays on the server, and
 * nothing here can take the page down.
 */
export async function getYoutubeView(
  supabase: SupabaseClient<Database>,
  event: { id: string; startsAt: string; endsAt: string },
  screenToken: string | null,
  now: number,
): Promise<StreamView> {
  try {
    const { data, error } = await supabase.rpc("service_stream_state", {
      p_event_id: event.id,
      p_platform: "youtube",
      p_screen_token: screenToken,
    });
    const state = error ? null : stateSchema.safeParse(data).data;
    if (!state) {
      return { status: "off" };
    }
    const apiKey = process.env.YOUTUBE_API_KEY;
    const latest = state.samples.at(-1) ?? null;
    if (!apiKey || !state.channel) {
      return { status: "off" };
    }
    if (!inStreamWindow(event.startsAt, event.endsAt, now)) {
      return latest
        ? { status: "ended", viewers: latest.viewers, samples: state.samples }
        : { status: "waiting" };
    }
    if (!viewerReadingDue(latest?.at ?? null, now)) {
      return latest
        ? { status: "live", viewers: latest.viewers, samples: state.samples }
        : { status: "waiting" };
    }

    let videoId = state.externalId;
    if (!videoId) {
      if (!streamSearchDue(state.lastSearchAt, now)) {
        return { status: "waiting" };
      }
      videoId = readYoutubeSearch(await youtube(youtubeSearchUrl(state.channel, apiKey)));
      await supabase.rpc("save_stream_search", {
        p_event_id: event.id,
        p_platform: "youtube",
        p_external_id: videoId,
        p_screen_token: screenToken,
      });
      if (!videoId) {
        return { status: "waiting" };
      }
    }

    const reading = readYoutubeVideo(await youtube(youtubeVideoUrl(videoId, apiKey)));
    if (!reading.live || reading.viewers === null) {
      return latest
        ? { status: "ended", viewers: latest.viewers, samples: state.samples }
        : { status: "waiting" };
    }
    await supabase.rpc("save_viewer_sample", {
      p_event_id: event.id,
      p_platform: "youtube",
      p_viewers: reading.viewers,
      p_screen_token: screenToken,
    });
    return {
      status: "live",
      viewers: reading.viewers,
      samples: [...state.samples, { at: new Date(now).toISOString(), viewers: reading.viewers }],
    };
  } catch {
    return { status: "off" };
  }
}
