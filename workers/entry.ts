// The Worker's entry (ADD-DASH-09): the Next.js app, plus the live room, which OpenNext can't
// export by itself. This folder is left out of tsconfig: it needs Cloudflare's runtime types and
// the built app. The rules it uses are typed and tested in lib/domain/live-room.ts.
import { withSentry } from "@sentry/nextjs/cloudflare";
import handler from "../.open-next/worker.js";
import { startFrequentJobs } from "../lib/domain/job-trigger";
import { bridgeTokenFrom, bridgeTokenMatches, verifyLiveTicket } from "../lib/domain/live-room";
import { scrubEvent, SENTRY_DATA_COLLECTION } from "../lib/domain/monitoring";

export { LiveRoom } from "./live-room";

type Env = {
  LIVE_ROOM: DurableObjectNamespace;
  LIVE_ROOM_SECRET?: string;
  SENTRY_DSN?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_DISPATCH_REPO?: string;
};

// The app's errors go to Sentry once SENTRY_DSN is set; with no address it does nothing. The live
// room stays outside this. See docs/runbooks/monitoring.md.
const sentryOptions = (env: Env) => ({
  dsn: env.SENTRY_DSN,
  dataCollection: SENTRY_DATA_COLLECTION,
  tracesSampleRate: 0,
  beforeSend: (event) => scrubEvent(event),
});
const app = withSentry(sentryOptions, handler);

// Cloudflare's timer (wrangler.jsonc) starts the jobs GitHub's own schedule runs hours late. If
// GitHub refuses, the error reaches Sentry. See docs/runbooks/scheduling.md.
const jobs = withSentry(sentryOptions, {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const started = await startFrequentJobs(
      env.GITHUB_DISPATCH_TOKEN,
      env.GITHUB_DISPATCH_REPO || undefined,
    );
    console.log(`Scheduled jobs started: ${started}.`);
  },
});

async function live(request: Request, env: Env, url: URL): Promise<Response> {
  const secret = env.LIVE_ROOM_SECRET;
  if (!secret) {
    return new Response("The live room is off", { status: 404 });
  }
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket", { status: 426 });
  }
  const allowed =
    url.pathname === "/live/bridge"
      ? bridgeTokenMatches(secret, bridgeTokenFrom(request.headers.get("Sec-WebSocket-Protocol")))
      : url.pathname === "/live/connect" &&
        (await verifyLiveTicket(secret, url.searchParams.get("ticket"), Date.now()));
  if (!allowed) {
    return new Response("Not allowed", { status: 401 });
  }
  return env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName("church")).fetch(request);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/live/")) {
      return live(request, env, url);
    }
    return app.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return jobs.scheduled(controller, env, ctx);
  },
};

export default worker;
