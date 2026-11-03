import { DurableObject } from "cloudflare:workers";
import {
  bridgeMessageSchema,
  BRIDGE_PROTOCOL,
  EMPTY_LIVE_STATE,
  type LiveState,
  MAX_BRIDGE_MESSAGE_BYTES,
  MAX_VIEWERS,
} from "../lib/domain/live-room";

const SAVE_READING_MS = 10_000;

/**
 * The live room (ADD-DASH-09): takes readings from the church bridge and passes them to open
 * screens. The Worker checks who may connect before anything reaches here. It only passes readings
 * along: nothing a screen sends goes anywhere, and nothing here can reach the church's gear.
 */
export class LiveRoom extends DurableObject {
  private state: LiveState = EMPTY_LIVE_STATE;
  private savedAt = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    // Hibernation clears memory, so a new screen could otherwise see nothing until the next reading.
    void ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<LiveState>("state")) ?? EMPTY_LIVE_STATE;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const role = new URL(request.url).pathname.endsWith("/bridge") ? "bridge" : "viewer";
    if (role === "viewer" && this.ctx.getWebSockets("viewer").length >= MAX_VIEWERS) {
      return new Response("Too many screens", { status: 503 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [role]);
    if (role === "viewer") {
      server.send(JSON.stringify(this.state));
    }
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: role === "bridge" ? { "Sec-WebSocket-Protocol": BRIDGE_PROTOCOL } : {},
    });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.ctx.getTags(socket).includes("bridge") || typeof message !== "string") {
      return;
    }
    if (message.length > MAX_BRIDGE_MESSAGE_BYTES) {
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(message);
    } catch {
      return;
    }
    const parsed = bridgeMessageSchema.safeParse(body);
    if (!parsed.success) {
      return;
    }

    const now = Date.now();
    this.state =
      parsed.data.type === "reading"
        ? { ...this.state, reading: parsed.data, bridgeSeenAt: now }
        : { ...this.state, slides: parsed.data, bridgeSeenAt: now };

    if (parsed.data.type === "slides" || now - this.savedAt >= SAVE_READING_MS) {
      this.savedAt = now;
      await this.ctx.storage.put("state", this.state);
    }

    // A reading goes out on its own; pictures only when the slide changes.
    const update =
      parsed.data.type === "reading"
        ? JSON.stringify({ reading: parsed.data, bridgeSeenAt: now })
        : JSON.stringify({ slides: parsed.data, bridgeSeenAt: now });
    for (const viewer of this.ctx.getWebSockets("viewer")) {
      try {
        viewer.send(update);
      } catch {
        // That screen has gone. The room drops it by itself.
      }
    }
  }

  async webSocketClose(): Promise<void> {
    // Nothing to tidy: screens work out that the bridge is offline from the silence.
  }
}
