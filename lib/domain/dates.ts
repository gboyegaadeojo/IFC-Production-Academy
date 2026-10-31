// Dates are stored in UTC and shown in Winnipeg time.

const DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  dateStyle: "medium",
});

/** "Oct 30, 2026" in Winnipeg time. */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}
