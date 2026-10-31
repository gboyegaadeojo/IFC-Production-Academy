import { z } from "zod";
import { getCurrentUser } from "@/lib/data/auth";
import { mediaConfig, readableLibraryVideo } from "@/lib/data/media";
import { originOutcome, originRequestHeaders, originUrl } from "@/lib/domain/media";

// Streams a lesson's church video library file (lib/domain/media.ts; SRS-LESSON-002, SRS-SOP-006).
// Every request, including each byte range the player asks for, checks the session and reads the
// lesson through row-level security. The file address and the Access token never reach the
// browser. Logs carry status and timing only, never paths or people.

const lessonId = z.uuid();

function empty(status: number, headers?: HeadersInit): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });
}

async function serve(
  request: Request,
  { params }: RouteContext<"/media/lessons/[lessonId]">,
): Promise<Response> {
  const started = Date.now();
  const id = lessonId.safeParse((await params).lessonId);
  if (!id.success) {
    return empty(404);
  }
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return empty(401);
  }
  const config = mediaConfig();
  if (!config) {
    return empty(503, { "Retry-After": "3600" });
  }
  const path = await readableLibraryVideo(id.data);
  const url = path ? originUrl(config.originUrl, path) : null;
  if (!path || !url) {
    return empty(404);
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: originRequestHeaders(
        { range: request.headers.get("range"), ifRange: request.headers.get("if-range") },
        config,
      ),
      // An Access login redirect means the token is wrong: report it, don't follow it.
      redirect: "manual",
      signal: request.signal,
    });
  } catch {
    console.warn(`media: origin unreachable after ${Date.now() - started} ms`);
    return empty(503, { "Retry-After": "60" });
  }

  const outcome = originOutcome(upstream, path);
  switch (outcome.kind) {
    case "stream":
      return new Response(request.method === "HEAD" ? null : upstream.body, {
        status: outcome.status,
        headers: outcome.headers,
      });
    case "unchanged":
      await upstream.body?.cancel();
      return new Response(null, { status: 304, headers: outcome.headers });
    case "range_not_satisfiable":
      await upstream.body?.cancel();
      return new Response(null, { status: 416, headers: outcome.headers });
    case "missing":
      await upstream.body?.cancel();
      return empty(404);
    case "unavailable":
      await upstream.body?.cancel();
      console.warn(`media: origin answered ${upstream.status} after ${Date.now() - started} ms`);
      return empty(502);
  }
}

export const GET = serve;
export const HEAD = serve;
