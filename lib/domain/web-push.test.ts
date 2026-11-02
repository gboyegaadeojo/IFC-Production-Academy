import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  pushAudience,
  pushMessageFor,
  vapidToken,
} from "./web-push";

const enc = new TextEncoder();

async function ecKeys(usage: "ECDH" | "ECDSA") {
  return (await crypto.subtle.generateKey(
    { name: usage, namedCurve: "P-256" },
    true,
    usage === "ECDH" ? ["deriveBits"] : ["sign", "verify"],
  )) as CryptoKeyPair;
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: string | Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const infoBytes = typeof info === "string" ? enc.encode(info) : info;
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: infoBytes },
      key,
      bytes * 8,
    ),
  );
}

/** The browser's side of RFC 8291, written out separately to check the sender. */
async function decrypt(
  body: Uint8Array<ArrayBuffer>,
  ua: CryptoKeyPair,
  auth: Uint8Array<ArrayBuffer>,
) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer).getUint32(16);
  const idlen = body[20]!;
  const senderPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const senderKey = await crypto.subtle.importKey(
    "raw",
    senderPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: senderKey }, ua.privateKey, 256),
  );
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...senderPublic]);
  const ikm = await hkdf(auth, shared, info, 32);
  const cek = await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16);
  const nonce = await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher),
  );
  return { rs, idlen, delimiter: plain.at(-1), text: new TextDecoder().decode(plain.slice(0, -1)) };
}

describe("web push encryption (RFC 8291)", () => {
  it("encrypts so the browser can decrypt, with one final record", async () => {
    const ua = await ecKeys("ECDH");
    const auth = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
    const p256dh = base64UrlEncode(
      new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)),
    );
    const message = JSON.stringify({
      title: "You're scheduled",
      body: "Sunday 9:00",
      url: "/schedule",
    });
    const body = await encryptPayload({ p256dh, auth: base64UrlEncode(auth) }, message);
    const out = await decrypt(body, ua, auth);
    expect(out.text).toBe(message);
    expect(out.delimiter).toBe(2);
    expect(out.rs).toBe(4096);
    expect(out.idlen).toBe(65);
  });

  it("uses a fresh key and salt each time", async () => {
    const ua = await ecKeys("ECDH");
    const p256dh = base64UrlEncode(
      new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)),
    );
    const sub = { p256dh, auth: base64UrlEncode(new Uint8Array(16)) };
    const a = await encryptPayload(sub, "same");
    const b = await encryptPayload(sub, "same");
    expect(base64UrlEncode(a)).not.toBe(base64UrlEncode(b));
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs a token for the push service that the public key verifies", async () => {
    const pair = await ecKeys("ECDSA");
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const vapid = {
      publicKey: base64UrlEncode(publicRaw),
      privateKey: jwk.d!,
      subject: "https://academy.example.org",
    };
    const now = new Date("2026-11-01T12:00:00Z");
    const token = await vapidToken(vapid, "https://push.example.net", now);
    const [header, claims, signature] = token.split(".");
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      base64UrlDecode(signature!),
      enc.encode(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(claims!))) as Record<
      string,
      unknown
    >;
    expect(parsed).toEqual({
      aud: "https://push.example.net",
      exp: now.getTime() / 1000 + 43200,
      sub: "https://academy.example.org",
    });
  });

  it("only sends to https push services", () => {
    expect(pushAudience("https://fcm.googleapis.com/fcm/send/abc")).toBe(
      "https://fcm.googleapis.com",
    );
    expect(() => pushAudience("http://push.example.net/x")).toThrow();
  });
});

describe("the alert for a notification", () => {
  it("opens the notification's page, or the inbox when it has none", () => {
    const base = { id: "n1", title: "Assessment passed", body: "Well done" };
    expect(pushMessageFor({ ...base, link: "/profile" })).toEqual({
      title: "Assessment passed",
      body: "Well done",
      url: "/profile",
      tag: "n1",
    });
    expect(pushMessageFor({ ...base, link: null }).url).toBe("/notifications");
    expect(pushMessageFor({ ...base, link: "https://elsewhere.example" }).url).toBe(
      "/notifications",
    );
  });

  it("round-trips base64url", () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
  });
});
