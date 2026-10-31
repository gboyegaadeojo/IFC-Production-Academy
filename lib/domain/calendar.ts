/**
 * Calendar files (SPEC §9 Phase 5 "calendar"). Builds an iCalendar (.ics) file of a volunteer's
 * upcoming serving, so it lands in Google, Apple, or Outlook calendars. RFC 5545: CRLF lines,
 * escaped text, lines folded at 75 octets, times in UTC.
 */

export type CalendarEntry = {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  confirmed: boolean;
};

/** Escapes text for an iCalendar property value. */
export function icsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** 20261108T150000Z */
export function icsTime(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Folds a content line at 75 octets, continuing with a space (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) {
    return line;
  }
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + length > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildCalendar(entries: readonly CalendarEntry[], stamp: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IFC Production Academy//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:IFC serving schedule",
    ...entries.flatMap((entry) => [
      "BEGIN:VEVENT",
      `UID:${entry.uid}@ifc-production-academy`,
      `DTSTAMP:${icsTime(stamp)}`,
      `DTSTART:${icsTime(entry.startsAt)}`,
      `DTEND:${icsTime(entry.endsAt)}`,
      `SUMMARY:${icsText(entry.title)}`,
      ...(entry.description ? [`DESCRIPTION:${icsText(entry.description)}`] : []),
      ...(entry.location ? [`LOCATION:${icsText(entry.location)}`] : []),
      `STATUS:${entry.confirmed ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
