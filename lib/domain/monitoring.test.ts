import { describe, expect, it } from "vitest";
import { scrubEvent, scrubPath, scrubText, scrubUrl, scrubUsageProperties } from "./monitoring";

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

describe("scrubUsageProperties", () => {
  it("scrubs every address and leaves other properties alone", () => {
    expect(
      scrubUsageProperties({
        $current_url: "https://academy.example.org/invite/secret-token",
        $referrer: "https://academy.example.org/verify/ABC-123?x=1",
        $pathname: `/courses/${ID}`,
        $browser: "Safari",
      }),
    ).toEqual({
      $current_url: "https://academy.example.org/invite/[token]",
      $referrer: "https://academy.example.org/verify/[reference]",
      $pathname: "/courses/[id]",
      $browser: "Safari",
    });
  });
});
