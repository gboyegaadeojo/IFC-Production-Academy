import { describe, expect, it } from "vitest";
import {
  scrubAddresses,
  scrubEvent,
  scrubPath,
  scrubText,
  scrubUrl,
  scrubUsageEvent,
} from "./monitoring";

const ID = "b7ba9dae-cab5-43e0-a996-8ae9d2436855";

describe("scrubPath", () => {
  it("hides invite tokens and certificate references", () => {
    expect(scrubPath("/invite/secret-token")).toBe("/invite/[token]");
    expect(scrubPath("/verify/ABC-123")).toBe("/verify/[reference]");
    expect(scrubPath("/certificates/ABC-123")).toBe("/certificates/[reference]");
  });

  it("drops query strings and turns IDs into a placeholder", () => {
    expect(scrubPath(`/courses/${ID}/lessons/intro?next=/home#top`)).toBe(
      "/courses/[id]/lessons/intro",
    );
  });
});

describe("scrubUrl", () => {
  it("keeps the site and the safe path, and drops the ticket", () => {
    expect(scrubUrl("https://academy.example.org/live/connect?ticket=secret")).toBe(
      "https://academy.example.org/live/connect",
    );
  });

  it("drops what it can't read", () => {
    expect(scrubUrl("not a url")).toBe("");
  });
});

describe("scrubText", () => {
  it("removes emails, quoted values, IDs and query strings", () => {
    const text = scrubText(
      `Key (email)=(riley.test@example.com) for "Riley Example" on ${ID} at https://x.example.org/a?code=secret`,
    );
    expect(text).not.toContain("riley.test");
    expect(text).not.toContain("Riley Example");
    expect(text).not.toContain(ID);
    expect(text).not.toContain("secret");
    expect(text).toContain("https://x.example.org/a");
  });
});

describe("scrubEvent", () => {
  it("keeps what went wrong and drops who and what", () => {
    const event = scrubEvent({
      message: 'Failed for "Riley Example"',
      user: { email: "riley.test@example.com" },
      extra: { body: "private" },
      breadcrumbs: [{ data: { url: "https://x.example.org/rest?select=*" } }],
      server_name: "church-laptop",
      request: {
        url: "https://academy.example.org/invite/secret-token?next=/home",
        cookies: { session: "secret" },
        headers: { authorization: "secret" },
        query_string: "next=/home",
        data: { email: "riley.test@example.com" },
      },
      exception: { values: [{ value: "Nobody at riley.test@example.com" }] },
    });
    expect(event).toEqual({
      message: 'Failed for "…"',
      request: { url: "https://academy.example.org/invite/[token]" },
      exception: { values: [{ value: "Nobody at [email]" }] },
    });
  });
});

describe("scrubAddresses", () => {
  it("reaches addresses at any depth and leaves other values alone", () => {
    const when = new Date("2026-11-03T12:00:00Z");
    expect(
      scrubAddresses({
        name: "Safari",
        count: 3,
        when,
        nested: { list: [{ url: "https://x.example.org/invite/secret?code=1" }] },
      }),
    ).toEqual({
      name: "Safari",
      count: 3,
      when,
      nested: { list: [{ url: "https://x.example.org/invite/[token]" }] },
    });
  });
});

describe("scrubEvent's nested addresses", () => {
  it("covers Sentry's own copies of the address", () => {
    const event = scrubEvent({
      transaction: "/invite/secret-token",
      tags: { url: "https://academy.example.org/invite/secret-token?next=/home" },
    } as Parameters<typeof scrubEvent>[0]);
    expect(JSON.stringify(event)).not.toContain("secret-token");
    expect(JSON.stringify(event)).not.toContain("next=");
  });
});

describe("scrubUsageEvent", () => {
  it("scrubs every address on a page view, including nested and person fields", () => {
    const event = scrubUsageEvent({
      event: "$pageview",
      properties: {
        $current_url: "https://academy.example.org/invite/secret-token",
        $referrer: "https://academy.example.org/verify/ABC-123?x=1",
        $pathname: `/courses/${ID}`,
        $browser: "Safari",
        title: "Certificate for Riley Example",
        $web_vitals_FCP_event: {
          navigationURL: "https://academy.example.org/invite/secret-token?code=1",
        },
      },
      $set_once: { $initial_current_url: "https://academy.example.org/invite/secret-token" },
    });
    expect(event).toEqual({
      event: "$pageview",
      properties: {
        $current_url: "https://academy.example.org/invite/[token]",
        $referrer: "https://academy.example.org/verify/[reference]",
        $pathname: "/courses/[id]",
        $browser: "Safari",
        $web_vitals_FCP_event: { navigationURL: "https://academy.example.org/invite/[token]" },
      },
      $set_once: { $initial_current_url: "https://academy.example.org/invite/[token]" },
    });
  });

  it("sends nothing but page views", () => {
    for (const name of ["$web_vitals", "$autocapture", "$exception", "$snapshot"]) {
      expect(
        scrubUsageEvent({
          event: name,
          properties: { $current_url: "https://academy.example.org/invite/secret-token" },
        }),
      ).toBeNull();
    }
  });
});
