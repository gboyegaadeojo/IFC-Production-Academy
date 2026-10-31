/**
 * Lesson video (SRS-LESSON-002, -003, -004, -007). A lesson stores a provider and a reference,
 * never pasted embed code. Each provider is a VideoSource, so another host can be added without
 * touching lessons, progress, or the lesson page.
 *
 * - youtube: an unlisted video id. Unlisted links are shareable secrets, not access control: anyone
 *   with the link can watch, so keep sensitive material out of them (SRS-LESSON-007, -008).
 * - nas: a file in the church video library (UniFi NAS), streamed through the app after a
 *   per-person access check, so it suits restricted material (SRS-SOP-006). Decided 2026-10-30.
 */

export type VideoProvider = "youtube" | "nas";

export type VideoRef = { provider: VideoProvider; id: string };

export type VideoSource = {
  provider: VideoProvider;
  /** How people name it in the editor. */
  label: string;
  /** "embed": the provider's own player. "file": our player, streamed through the app. */
  playback: "embed" | "file";
  /** The stored reference from what a leader typed, or null if it isn't valid for this source. */
  parse(input: string): string | null;
};

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);
const YOUTUBE_PATH_PREFIXES = ["/embed/", "/shorts/", "/live/", "/v/"];

export const youtube: VideoSource = {
  provider: "youtube",
  label: "YouTube",
  playback: "embed",
  parse(input) {
    const value = input.trim();
    if (YOUTUBE_ID.test(value)) {
      return value;
    }
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
      return null;
    }
    let candidate: string | null | undefined;
    if (host === "youtu.be") {
      candidate = url.pathname.split("/")[1];
    } else if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    } else {
      const prefix = YOUTUBE_PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
      candidate = prefix ? url.pathname.slice(prefix.length).split("/")[0] : null;
    }
    return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
  },
};

/** Privacy-enhanced embed address for the IFrame player. */
export function youtubeEmbedUrl(id: string, options: { origin?: string } = {}): string {
  const params = new URLSearchParams({ rel: "0", enablejsapi: "1", playsinline: "1" });
  if (options.origin) {
    params.set("origin", options.origin);
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** Where to watch if the embed doesn't load (SRS-LESSON-004), and the editor's display value. */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

// ---------------------------------------------------------------------------
// Church video library (NAS)
// ---------------------------------------------------------------------------

const NAS_SEGMENT = /^[A-Za-z0-9._ -]+$/;
const NAS_EXTENSION = /\.(mp4|m4v|webm)$/i;

/** Same rule as the lessons_video_ref_format check in the database. */
export const nas: VideoSource = {
  provider: "nas",
  label: "Church video library",
  playback: "file",
  parse(input) {
    const value = input.trim().replaceAll("\\", "/");
    if (value.length === 0 || value.length > 300 || value.startsWith("/")) {
      return null;
    }
    const segments = value.split("/");
    const safe = segments.every(
      (segment) =>
        NAS_SEGMENT.test(segment) &&
        segment !== "." &&
        segment !== ".." &&
        segment.trim() === segment,
    );
    return safe && NAS_EXTENSION.test(value) ? value : null;
  },
};

// ---------------------------------------------------------------------------

const SOURCES: Record<VideoProvider, VideoSource> = { youtube, nas };

export const VIDEO_PROVIDERS = Object.keys(SOURCES) as VideoProvider[];

export function isVideoProvider(value: string): value is VideoProvider {
  return Object.hasOwn(SOURCES, value);
}

export function videoSource(provider: VideoProvider): VideoSource {
  return SOURCES[provider];
}

/** Reads what a leader typed for the given source. Null if it isn't valid there. */
export function parseVideo(provider: VideoProvider, input: string): VideoRef | null {
  const id = SOURCES[provider].parse(input);
  return id ? { provider, id } : null;
}

/** A stored provider and reference, checked again on the way out. Null if missing or invalid. */
export function storedVideo(provider: string | null, ref: string | null): VideoRef | null {
  if (provider === null || ref === null || !isVideoProvider(provider)) {
    return null;
  }
  return SOURCES[provider].parse(ref) === ref ? { provider, id: ref } : null;
}

/** What the editor shows for a stored video: the watch link for YouTube, the path for files. */
export function videoInputValue(video: VideoRef): string {
  return video.provider === "youtube" ? youtubeWatchUrl(video.id) : video.id;
}

/** Resume a little before where the learner stopped; start over if they were near the start. */
export function resumeFrom(positionSeconds: number): number {
  return positionSeconds < 15 ? 0 : Math.max(0, Math.floor(positionSeconds) - 5);
}
