// Dates are stored in UTC and shown in Winnipeg time.

import { TIME_ZONE } from "./time-zone";

const DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
});

/** "Oct 30, 2026" in Winnipeg time. */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

const LONG_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  dateStyle: "long",
});

/** "October 30, 2026" in Winnipeg time, for printed documents such as certificates. */
export function formatLongDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}
