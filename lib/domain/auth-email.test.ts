import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isSupportedAction, signInEmail, verifyHookSignature } from "./auth-email";

// A fake secret in Supabase's format, made for this test only.
const keyBytes = Buffer.from("fake-hook-secret-for-tests-only-32b");
const secret = `v1,whsec_${keyBytes.toString("base64")}`;
const now = 1_800_000_000;

function sign(id: string, timestamp: number, body: string, key = keyBytes) {
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

describe("checking a call came from Supabase", () => {
  const body = '{"fake":true}';

  it("accepts a correct signature sent just now", async () => {
    expect(
      await verifyHookSignature({
        secret,
        id: "msg_1",
        timestamp: String(now),
        signatures: sign("msg_1", now, body),
        body,
        nowSeconds: now + 10,
      }),
    ).toBe(true);
  });

  it("accepts one of several signatures, as during a secret change", async () => {
    const other = sign("msg_1", now, body, Buffer.from("an-old-fake-secret"));
    expect(
      await verifyHookSignature({
        secret,
        id: "msg_1",
        timestamp: String(now),
        signatures: `${other} ${sign("msg_1", now, body)}`,
        body,
        nowSeconds: now,
      }),
    ).toBe(true);
  });

  it("rejects a changed body, a wrong secret, or an old call", async () => {
    const base = { secret, id: "msg_1", timestamp: String(now), nowSeconds: now };
    expect(
      await verifyHookSignature({
        ...base,
        signatures: sign("msg_1", now, body),
        body: '{"fake":false}',
      }),
    ).toBe(false);
    expect(
      await verifyHookSignature({
        ...base,
        signatures: sign("msg_1", now, body, Buffer.from("not-the-secret")),
        body,
      }),
    ).toBe(false);
    expect(
      await verifyHookSignature({
        ...base,
        signatures: sign("msg_1", now, body),
        body,
        nowSeconds: now + 3600,
      }),
    ).toBe(false);
  });

  it("rejects a call with headers missing", async () => {
    expect(
      await verifyHookSignature({
        secret,
        id: null,
        timestamp: String(now),
        signatures: sign("msg_1", now, body),
        body,
        nowSeconds: now,
      }),
    ).toBe(false);
  });
});

describe("the sign-in email", () => {
  it("links to the confirm page with the token, in the Calm design", () => {
    const email = signInEmail({
      action: "magiclink",
      tokenHash: "fake-hash",
      siteUrl: "https://academy.example.org/",
    });
    expect(email.subject).toBe("Your sign-in link");
    expect(email.html).toContain(
      'href="https://academy.example.org/auth/confirm?token_hash=fake-hash&amp;type=email&amp;next=%2Fhome"',
    );
    expect(email.html).toContain(">Sign in</a>");
    expect(email.html).not.toContain("<svg");
    expect(email.html).toContain('src="https://academy.example.org/brand/icon"');
    expect(email.text).toContain("token_hash=fake-hash");
  });

  it("handles only the kinds of email the Academy uses", () => {
    expect(isSupportedAction("magiclink")).toBe(true);
    expect(isSupportedAction("signup")).toBe(true);
    expect(isSupportedAction("invite")).toBe(true);
    expect(isSupportedAction("recovery")).toBe(false);
    expect(isSupportedAction("email_change")).toBe(false);
  });
});
