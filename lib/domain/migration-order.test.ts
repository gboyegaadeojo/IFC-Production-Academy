import { describe, expect, it } from "vitest";
import { migrationOrderProblems } from "./migration-order";

const MAIN = ["20261030120000_foundation.sql", "20270108120000_assignment_due_dates.sql"];

describe("migrationOrderProblems", () => {
  it("accepts a new migration dated after the newest on main", () => {
    expect(migrationOrderProblems(MAIN, [...MAIN, "20270109120000_feature_flags.sql"])).toEqual([]);
  });

  it("refuses one dated today when main has future-dated ones", () => {
    expect(migrationOrderProblems(MAIN, [...MAIN, "20261108120000_feature_flags.sql"])).toEqual([
      {
        file: "20261108120000_feature_flags.sql",
        reason: "must be dated after 20270108120000, the newest migration on main",
      },
    ]);
  });

  it("refuses a badly named file and two new files with one timestamp", () => {
    expect(
      migrationOrderProblems(MAIN, [
        ...MAIN,
        "feature_flags.sql",
        "20270109120000_a.sql",
        "20270109120000_b.sql",
      ]),
    ).toEqual([
      { file: "20270109120000_b.sql", reason: "has the same timestamp as 20270109120000_a.sql" },
      { file: "feature_flags.sql", reason: "isn't named YYYYMMDDHHMMSS_words.sql" },
    ]);
  });

  it("leaves migrations already on main alone", () => {
    expect(migrationOrderProblems(MAIN, MAIN)).toEqual([]);
  });
});
