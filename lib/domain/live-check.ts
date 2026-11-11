/**
 * What the check after every deploy expects of the live site (health check, 2026-11-10). It runs
 * signed out, reads only public pages and two API calls that return yes or no, and reports
 * status codes and timings only, never page content.
 */

/** Public pages that must load. */
export const PUBLIC_PAGES = [
  "/sign-in",
  "/help",
  "/serve-with-us",
  "/manifest.webmanifest",
  "/sw.js",
] as const;

/** Private pages that must send a signed-out visitor to sign-in, and show nothing else. */
export const PRIVATE_PAGES = ["/home", "/schedule", "/admin"] as const;

export type PageResult = { path: string; status: number; body: string; location: string | null };

/** Why a page failed the check, or null if it passed. */
export function pageProblem(
  kind: "public" | "private",
  { path, status, body, location }: PageResult,
): string | null {
  if (kind === "public") {
    return status === 200 ? null : `${path}: expected 200, got ${status}`;
  }
  // Next.js streams pages, so a redirect can arrive inside a 200 response.
  const redirectsToSignIn =
    ((status === 307 || status === 302 || status === 303) &&
      (location ?? "").includes("/sign-in")) ||
    (status === 200 && body.includes("NEXT_REDIRECT;replace;/sign-in"));
  return redirectsToSignIn ? null : `${path}: expected a redirect to sign-in, got ${status}`;
}

/** The live version must be the commit that was just deployed (the site reports 12 characters). */
export function versionProblem(live: string, commit: string): string | null {
  return live !== "" && commit.startsWith(live)
    ? null
    : `version: expected ${commit.slice(0, 12)}, live is ${live || "unknown"}`;
}
