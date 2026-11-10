import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIME_ZONE } from "./time-zone";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
/** The migration that moved every database function to the fixed offset. */
const FIXED_FROM = "20270119121400";

describe("TIME_ZONE", () => {
  it("is UTC−5 in winter, as Manitoba has been since 2026-11-01", () => {
    const time = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date("2026-12-06T15:00:00Z"));
    expect(time).toBe("10:00");
  });

  it("and in summer", () => {
    const time = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date("2027-07-04T15:00:00Z"));
    expect(time).toBe("10");
  });
});

describe("migrations", () => {
  it("never use the old Winnipeg rule after the fixed offset", () => {
    const named = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith(".sql") && file.slice(0, 14) > FIXED_FROM)
      .filter((file) => readFileSync(join(MIGRATIONS, file), "utf8").includes("America/Winnipeg"));
    expect(named, "use 'Etc/GMT+5' (see lib/domain/time-zone.ts)").toEqual([]);
  });
});
