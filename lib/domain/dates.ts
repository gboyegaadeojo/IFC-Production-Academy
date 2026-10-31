// Dates are stored in UTC and shown in Winnipeg time.

const DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  dateStyle: "medium",
});

/** "Oct 30, 2026" in Winnipeg time. */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

const LONG_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  dateStyle: "long",
});

/** "October 30, 2026" in Winnipeg time, for printed documents such as certificates. */
export function formatLongDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}
