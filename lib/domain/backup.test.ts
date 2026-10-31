import { describe, expect, it } from "vitest";
import {
  backupNames,
  backupStamp,
  filesToDelete,
  latestCompleteStamp,
  stampOf,
  stampsToKeep,
} from "./backup";

/** One nightly stamp for each of the given number of days, ending on `end`. */
function nightly(end: string, days: number): string[] {
  const last = new Date(`${end}T08:00:00Z`).getTime();
  return Array.from({ length: days }, (_, i) => backupStamp(new Date(last - i * 86_400_000)));
}

describe("names", () => {
  it("stamps in UTC and names the three files", () => {
    expect(backupStamp(new Date("2026-11-02T08:00:41Z"))).toBe("2026-11-02T0800Z");
    expect(backupNames("2026-11-02T0800Z")).toEqual({
      db: "academy-db-2026-11-02T0800Z.dump.age",
      files: "academy-files-2026-11-02T0800Z.zip.age",
      checksums: "academy-2026-11-02T0800Z.sha256",
    });
    expect(stampOf("academy-files-2026-11-02T0800Z.zip.age")).toBe("2026-11-02T0800Z");
    expect(stampOf("notes.txt")).toBeNull();
  });
});

describe("stampsToKeep", () => {
  it("keeps 30 daily, 12 Sundays, and 12 month starts from two years of nightly copies", () => {
    const keep = stampsToKeep(nightly("2026-11-02", 730));
    const days = [...keep].map((s) => s.slice(0, 10));
    // The last 30 days.
    expect(days).toContain("2026-11-02");
    expect(days).toContain("2026-10-04");
    expect(days).not.toContain("2026-10-03");
    // Sundays reach back 12 weeks; month starts reach back 12 months.
    expect(days).toContain("2026-08-16");
    expect(days).toContain("2025-12-01");
    expect(days).not.toContain("2025-11-01");
    expect(keep.size).toBeLessThanOrEqual(54);
  });

  it("keeps only the newest copy of a day", () => {
    expect([...stampsToKeep(["2026-11-02T0800Z", "2026-11-02T1500Z"])]).toEqual([
      "2026-11-02T1500Z",
    ]);
  });
});

describe("filesToDelete", () => {
  it("deletes every file of an expired backup and nothing else", () => {
    const names = nightly("2026-11-02", 40).flatMap((stamp) => Object.values(backupNames(stamp)));
    const deleted = filesToDelete([...names, "README.txt"]);
    expect(deleted).not.toContain("README.txt");
    expect(deleted.every((name) => stampOf(name) !== null)).toBe(true);
    // 40 days, 30 kept; the Sunday and month start among the rest stay too.
    expect(deleted.length % 3).toBe(0);
    expect(deleted.length).toBeGreaterThan(0);
  });
});

describe("latestCompleteStamp", () => {
  it("skips a backup that's missing its files", () => {
    const complete = backupNames("2026-11-01T0800Z");
    expect(
      latestCompleteStamp([complete.db, complete.files, backupNames("2026-11-02T0800Z").db]),
    ).toBe("2026-11-01T0800Z");
    expect(latestCompleteStamp([])).toBeNull();
  });
});
