/**
 * Web push without a library (SPEC §PWA, SRS-NOTIF-005 "PWA push"): VAPID signing (RFC 8292) and
 * payload encryption (RFC 8291, aes128gcm), using only Web Crypto so the same code runs in the
 * Cloudflare Worker and in Node (the 15-minute job). No secrets live here; the private key is
 * passed in from a Cloudflare secret or a GitHub Actions secret.
 */

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushMessage = { title: string; body: string; url: string; tag?: string };

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** The push service's origin, the "aud" of the VAPID token. Only https endpoints are accepted. */
export function pushAudience(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") {
    throw new Error("Push endpoints must use https");
  }
  return url.origin;
}

/** A signed VAPID token (ES256 JWT) for one push service, valid for 12 hours. */
export async function vapidToken(
  vapid: VapidKeys,
  audience: string,
  now = new Date(),
): Promise<string> {
  const pub = base64UrlDecode(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: vapid.privateKey,
      x: base64UrlEncode(pub.slice(1, 33)),
      y: base64UrlEncode(pub.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Encrypts a payload for one browser (RFC 8291): a single aes128gcm record. */
export async function encryptPayload(
  subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  plaintext: string,
  // Fixed only in tests; random in use.
  fixed?: { salt: Uint8Array<ArrayBuffer>; keys: CryptoKeyPair },
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const local =
    fixed?.keys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256),
  );
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(encoder.encode("WebPush: info\0"), uaPublic, localPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the payload, then the 0x02 "last record" delimiter.
  const record = concat(encoder.encode(plaintext), new Uint8Array([2]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record),
  );
  const header = new Uint8Array(new ArrayBuffer(21));
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = localPublic.length;
  return concat(header, localPublic, cipher);
}

export type PushResult = "sent" | "gone" | "failed";

/**
 * Sends one alert to one device. "gone" means the browser has dropped the subscription (404 or
 * 410), so it should be deleted. Never throws for a delivery problem, and never logs.
 */
export async function sendPush(
  subscription: PushSubscriptionKeys,
  message: PushMessage,
  vapid: VapidKeys,
): Promise<PushResult> {
  try {
    const token = await vapidToken(vapid, pushAudience(subscription.endpoint));
    const body = await encryptPayload(subscription, JSON.stringify(message));
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body,
    });
    if (response.status === 404 || response.status === 410) {
      return "gone";
    }
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** The alert for an Academy notification: its title and body, opening its page in the app. */
export function pushMessageFor(notification: {
  id: string;
  title: string;
  body: string;
  link: string | null;
}): PushMessage {
  const link = notification.link && notification.link.startsWith("/") ? notification.link : null;
  return {
    title: notification.title.slice(0, 120),
    body: notification.body.slice(0, 300),
    url: link ?? "/notifications",
    tag: notification.id,
  };
}
