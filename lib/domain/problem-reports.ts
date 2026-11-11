/**
 * Report a problem (health check follow-up, G 2026-11-11): what a report holds, and the short
 * description of the device it came from. Only the page's path, a device summary, and the app
 * version are sent with the note: never the address's query, the full user agent, or anything
 * else about the person.
 */
import { z } from "zod";
import { TIME_ZONE } from "./time-zone";

const WHEN = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Sun, Nov 15, 9:12 a.m." in Winnipeg time. */
export function reportedAtLabel(iso: string): string {
  return WHEN.format(new Date(iso));
}

export const REPORT_MAX_LENGTH = 2000;

export const problemReportSchema = z.object({
  message: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "Say what happened.")
        .max(REPORT_MAX_LENGTH, "Keep it under 2,000 characters."),
    ),
  page: z
    .string()
    .max(300)
    .transform((value) => pagePath(value)),
  device: z.string().max(200),
  appVersion: z.string().max(40),
});

/** The page's path only: no query or fragment, which can hold tokens or names. */
export function pagePath(value: string): string {
  const path = value.split(/[?#]/)[0] ?? "";
  return path.startsWith("/") ? path.slice(0, 300) : "";
}

/** "iPhone, app installed", "Android, Chrome", "Computer, Safari": enough to find a problem. */
export function deviceSummary(userAgent: string, installed: boolean): string {
  const ua = userAgent.toLowerCase();
  const device = /ipad/.test(ua)
    ? "iPad"
    : /iphone|ipod/.test(ua)
      ? "iPhone"
      : /android/.test(ua)
        ? "Android"
        : /macintosh/.test(ua) && /mobile/.test(ua)
          ? "iPad"
          : "Computer";
  if (installed) {
    return `${device}, app installed`;
  }
  const browser = /edg\//.test(ua)
    ? "Edge"
    : /firefox|fxios/.test(ua)
      ? "Firefox"
      : /samsungbrowser/.test(ua)
        ? "Samsung Internet"
        : /chrome|crios/.test(ua)
          ? "Chrome"
          : /safari/.test(ua)
            ? "Safari"
            : "another browser";
  return `${device}, ${browser}`;
}

/** What a failed send says. */
export const REPORT_ERRORS: Record<string, string> = {
  too_many_reports:
    "You've sent 10 reports today. Thank you! Try again tomorrow, or tell a leader.",
  empty_report: "Say what happened.",
};
