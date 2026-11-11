import { describe, expect, it } from "vitest";
import { pageProblem, versionProblem } from "./live-check";

describe("pageProblem", () => {
  it("passes a public page that loads", () => {
    expect(
      pageProblem("public", { path: "/help", status: 200, body: "", location: null }),
    ).toBeNull();
  });

  it("fails a public page that doesn't", () => {
    expect(pageProblem("public", { path: "/help", status: 500, body: "", location: null })).toBe(
      "/help: expected 200, got 500",
    );
  });

  it("passes a private page that redirects, either way Next.js does it", () => {
    expect(
      pageProblem("private", { path: "/home", status: 307, body: "", location: "/sign-in" }),
    ).toBeNull();
    expect(
      pageProblem("private", {
        path: "/home",
        status: 200,
        body: "…NEXT_REDIRECT;replace;/sign-in;307;…",
        location: null,
      }),
    ).toBeNull();
  });

  it("fails a private page that shows itself to a signed-out visitor", () => {
    expect(
      pageProblem("private", {
        path: "/admin",
        status: 200,
        body: "<h1>Admin</h1>",
        location: null,
      }),
    ).toBe("/admin: expected a redirect to sign-in, got 200");
  });
});

describe("versionProblem", () => {
  it("passes when the live site runs the deployed commit", () => {
    expect(versionProblem("288b5e31efc1", "288b5e31efc1a2b3c4d5e6f7")).toBeNull();
  });

  it("fails when it doesn't yet, or can't say", () => {
    expect(versionProblem("1f5e6d6fbe06", "288b5e31efc1a2b3")).toBe(
      "version: expected 288b5e31efc1, live is 1f5e6d6fbe06",
    );
    expect(versionProblem("", "288b5e31efc1")).toBe(
      "version: expected 288b5e31efc1, live is unknown",
    );
  });
});
