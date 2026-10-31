/**
 * Church video library streaming (SRS-LESSON-002, SRS-SOP-006; decided 2026-10-30). Lessons can
 * play an MP4 that lives on the church's UniFi NAS. The browser never talks to the NAS: it asks the
 * app, the app checks that the person may read the lesson, then fetches the file through a
 * Cloudflare Tunnel protected by a Cloudflare Access service token and streams it back.
 *
 * Pure helpers for building the origin request and the response, so the rules are unit tested.
 */
import { nas } from "@/lib/domain/video";

export type MediaConfig = {
  /** The tunnel's public address, for example https://media.example.org. Never in the repo. */
  originUrl: string;
  accessClientId: string;
  accessClientSecret: string;
};

/** The file's address on the library origin, or null if the path isn't a valid library path. */
export function originUrl(base: string, path: string): string | null {
  if (nas.parse(path) !== path) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") {
    return null;
  }
  const prefix = url.pathname.replace(/\/+$/, "");
  url.pathname = `${prefix}/${path.split("/").map(encodeURIComponent).join("/")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** Only a single byte range, as browsers send for video. Anything else asks for the whole file. */
const SINGLE_RANGE = /^bytes=\d*-\d*$/;

export function originRequestHeaders(
  request: { range: string | null; ifRange: string | null },
  config: Pick<MediaConfig, "accessClientId" | "accessClientSecret">,
): Headers {
  const headers = new Headers({
    "CF-Access-Client-Id": config.accessClientId,
    "CF-Access-Client-Secret": config.accessClientSecret,
    Accept: "video/*",
  });
  if (request.range && SINGLE_RANGE.test(request.range) && request.range !== "bytes=-") {
    headers.set("Range", request.range);
    if (request.ifRange) {
      headers.set("If-Range", request.ifRange);
    }
  }
  return headers;
}

const PASSED_THROUGH = [
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const;

const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
};

/** The content type for a library path, from its extension (the only types we serve). */
export function videoContentType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_TYPES[extension] ?? "application/octet-stream";
}

export type OriginOutcome =
  | { kind: "stream"; status: 200 | 206; headers: Headers }
  | { kind: "unchanged"; headers: Headers }
  | { kind: "range_not_satisfiable"; headers: Headers }
  | { kind: "missing" }
  | { kind: "unavailable" };

/**
 * What to send the browser for the origin's response. The type comes from the stored path, not the
 * origin, and nothing is cached by shared caches: the file is only for this signed-in person.
 */
export function originOutcome(
  upstream: { status: number; headers: Headers },
  path: string,
): OriginOutcome {
  const headers = new Headers({
    "Content-Type": videoContentType(path),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  });
  for (const name of PASSED_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  const upstreamType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  const looksLikeVideo =
    upstreamType.startsWith("video/") || upstreamType.startsWith("application/octet-stream");

  switch (upstream.status) {
    case 200:
    case 206:
      return looksLikeVideo
        ? { kind: "stream", status: upstream.status, headers }
        : // An Access login page or an error page, not the file.
          { kind: "unavailable" };
    case 304:
      return { kind: "unchanged", headers };
    case 416:
      return { kind: "range_not_satisfiable", headers };
    case 404:
      return { kind: "missing" };
    default:
      return { kind: "unavailable" };
  }
}
