import { describe, expect, it } from "vitest";
import { buildCalendar, foldLine, icsText, icsTime } from "./calendar";

describe("icsText and icsTime", () => {
  it("escapes special characters and writes UTC times", () => {
    expect(icsText("Camera 2; wide, then tight\nBring a jacket")).toBe(
      "Camera 2\\; wide\\, then tight\\nBring a jacket",
    );
    expect(icsTime("2026-11-08T15:00:00.000Z")).toBe("20261108T150000Z");
  });
});

describe("foldLine", () => {
  it("folds long lines at 75 octets", () => {
    const folded = foldLine(`DESCRIPTION:${"x".repeat(100)}`);
    const lines = folded.split("\r\n");
    expect(lines[0]).toHaveLength(75);
    expect(lines[1]?.startsWith(" ")).toBe(true);
    expect(lines.join("").replaceAll(" ", "")).toBe(`DESCRIPTION:${"x".repeat(100)}`);
  });
});

describe("buildCalendar", () => {
  it("writes one event per assignment with its confirmation state", () => {
    const ics = buildCalendar(
      [
        {
          uid: "a1",
          title: "Fake switcher, Sunday service",
          description: "Camera Operations",
          location: "Main auditorium",
          startsAt: "2026-11-08T15:00:00.000Z",
          endsAt: "2026-11-08T17:00:00.000Z",
          confirmed: true,
        },
      ],
      "2026-10-31T12:00:00.000Z",
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:a1@ifc-production-academy\r\n");
    expect(ics).toContain("DTSTART:20261108T150000Z\r\n");
    expect(ics).toContain("SUMMARY:Fake switcher\\, Sunday service\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
