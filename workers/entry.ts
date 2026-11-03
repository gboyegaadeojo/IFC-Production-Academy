// The Worker's entry (ADD-DASH-09): the Next.js app, plus the live room, which OpenNext can't
// export by itself. This folder is left out of tsconfig: it needs Cloudflare's runtime types and
// the built app. The rules it uses are typed and tested in lib/domain/live-room.ts.
import handler from "../.open-next/worker.js";
import { bridgeTokenFrom, bridgeTokenMatches, verifyLiveTicket } from "../lib/domain/live-room";

export { LiveRoom } from "./live-room";

type Env = { LIVE_ROOM: DurableObjectNamespace; LIVE_ROOM_SECRET?: string };

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
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
