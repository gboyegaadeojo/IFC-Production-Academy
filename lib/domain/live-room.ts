/**
 * The live room (ADD-DASH-09): one Cloudflare Durable Object that takes readings from the church
 * bridge and passes them to open screens. Pure rules: what a message may contain, and the
 * short-lived tickets that let a screen connect. Used by the Worker, the app, and their tests.
 */
import { z } from "zod";
import { BRIDGE_PROTOCOL } from "./bridge-protocol";

export { BRIDGE_PROTOCOL };

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** Long enough to outlast the page's 30-second refresh, which brings a fresh one. */
export const TICKET_SECONDS = 5 * 60;

/** A ticket for a screen the server has already checked may see the dashboard. */
export async function mintLiveTicket(secret: string, now: number): Promise<string> {
  const expires = String(Math.floor(now / 1000) + TICKET_SECONDS);
  return `${expires}.${await sign(secret, expires)}`;
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyLiveTicket(
  secret: string,
  ticket: string | null,
  now: number,
): Promise<boolean> {
  const [expires, signature, ...rest] = (ticket ?? "").split(".");
  if (!expires || !signature || rest.length > 0 || !/^\d+$/.test(expires)) {
    return false;
  }
  if (Number(expires) * 1000 < now) {
    return false;
  }
  return sameText(signature, await sign(secret, expires));
}

export function bridgeTokenFrom(protocolHeader: string | null): string | null {
  const parts = (protocolHeader ?? "").split(",").map((part) => part.trim());
  return parts[0] === BRIDGE_PROTOCOL ? (parts[1] ?? null) : null;
}

export function bridgeTokenMatches(secret: string, token: string | null): boolean {
  return token !== null && sameText(secret, token);
}

const text = z.string().max(2000);

const timerSchema = z.object({
  name: z.string().max(200),
  time: z.string().max(40),
  state: z.string().max(40),
});

const encoderSchema = z.object({
  inputGood: z.boolean(),
  input: z.string().max(100),
  streams: z.array(z.object({ name: z.string().max(200), live: z.boolean() })).max(10),
});

/** What the bridge sends about once a second. A source it can't reach is null. */
export const readingSchema = z.object({
  type: z.literal("reading"),
  levels: z.record(z.string().max(12), z.number().min(0).max(100)).nullable(),
  names: z.record(z.string().max(12), z.string().max(40)).nullable(),
  encoder: encoderSchema.nullable(),
  timers: z.array(timerSchema).max(30).nullable(),
});

/** What the bridge sends when the slide changes: the one on screen and the next three. */
export const slidesSchema = z.object({
  type: z.literal("slides"),
  presentation: z.string().max(300),
  position: z.number().int().min(0),
  total: z.number().int().min(0),
  slides: z
    .array(
      z.object({
        index: z.number().int().min(0),
        text,
        // A small picture of the slide when ProPresenter gives one. Words otherwise.
        image: z.string().max(200_000).startsWith("data:image/").nullable(),
      }),
    )
    .max(4),
});

export const bridgeMessageSchema = z.discriminatedUnion("type", [readingSchema, slidesSchema]);
export type Reading = z.infer<typeof readingSchema>;
export type SlidesMessage = z.infer<typeof slidesSchema>;

/** What a screen is told: the latest of each, and how long ago the bridge was last heard. */
export type LiveState = {
  reading: Reading | null;
  slides: SlidesMessage | null;
  bridgeSeenAt: number | null;
};

export const EMPTY_LIVE_STATE: LiveState = { reading: null, slides: null, bridgeSeenAt: null };

/** No word from the bridge for this long means it's offline. */
export const BRIDGE_OFFLINE_MS = 10_000;

export function isBridgeOffline(bridgeSeenAt: number | null, now: number): boolean {
  return bridgeSeenAt === null || now - bridgeSeenAt > BRIDGE_OFFLINE_MS;
}

/** One message at most this big, so a mistake can't swamp every screen. */
export const MAX_BRIDGE_MESSAGE_BYTES = 900_000;

/** How many screens the room serves, so a full team can have it open at once. */
export const MAX_VIEWERS = 60;
