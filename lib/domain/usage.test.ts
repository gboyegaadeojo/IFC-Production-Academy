import { describe, expect, it } from "vitest";
import { usageLines, usageWarnings } from "./usage";

const MB = 1024 * 1024;

describe("free plan usage", () => {
  it("describes what's used", () => {
    expect(
      usageLines({ databaseBytes: 21 * MB, storageBytes: 5 * MB, chatFileBytes: 2 * MB }),
    ).toEqual([
      "Database: 21 MB of 500 MB (4%)",
      "Stored files: 5 MB of 1 GB (0%), of which chat files 2 MB",
    ]);
  });

  it("warns at 70%, not before", () => {
    expect(
      usageWarnings({ databaseBytes: 340 * MB, storageBytes: 700 * MB, chatFileBytes: 0 }),
    ).toEqual([]);
    const warnings = usageWarnings({
      databaseBytes: 350 * MB,
      storageBytes: 720 * MB,
      chatFileBytes: 600 * MB,
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^The database is at 70%/);
    expect(warnings[1]).toMatch(/fewer days on Admin → Features/);
  });
});
