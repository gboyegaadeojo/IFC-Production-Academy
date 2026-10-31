import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { MediaConfig } from "@/lib/domain/media";
import { storedVideo } from "@/lib/domain/video";

// Church video library (lib/domain/media.ts). Server-only configuration, set as Cloudflare
// environment variables (secrets), never in the repo or in logs. Until all three are set the
// library is off: leaders can't choose it and lessons say it isn't connected.

const mediaConfigSchema = z.object({
  MEDIA_ORIGIN_URL: z.url({ protocol: /^https$/ }),
  MEDIA_ACCESS_CLIENT_ID: z.string().min(1),
  MEDIA_ACCESS_CLIENT_SECRET: z.string().min(1),
});

export function mediaConfig(): MediaConfig | null {
  const result = mediaConfigSchema.safeParse({
    MEDIA_ORIGIN_URL: process.env.MEDIA_ORIGIN_URL,
    MEDIA_ACCESS_CLIENT_ID: process.env.MEDIA_ACCESS_CLIENT_ID,
    MEDIA_ACCESS_CLIENT_SECRET: process.env.MEDIA_ACCESS_CLIENT_SECRET,
  });
  return result.success
    ? {
        originUrl: result.data.MEDIA_ORIGIN_URL,
        accessClientId: result.data.MEDIA_ACCESS_CLIENT_ID,
        accessClientSecret: result.data.MEDIA_ACCESS_CLIENT_SECRET,
      }
    : null;
}

export function mediaLibraryEnabled(): boolean {
  return mediaConfig() !== null;
}

/**
 * The library path of a lesson's video, if the signed-in person may read the lesson. Row-level
 * security decides: members see published lessons of their department, curriculum staff see
 * their department's drafts too. Null for anything else.
 */
export async function readableLibraryVideo(lessonId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("video_provider, video_ref")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the lesson", { cause: error.code });
  }
  const video = data ? storedVideo(data.video_provider, data.video_ref) : null;
  return video?.provider === "nas" ? video.id : null;
}
