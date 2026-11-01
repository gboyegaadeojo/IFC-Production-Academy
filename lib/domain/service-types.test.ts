import { describe, expect, it } from "vitest";
import {
  buildMatrix,
  createServicesSchema,
  movePosition,
  serviceTimeLabel,
  serviceTypeSchema,
  toServiceTypeError,
  withoutPosition,
  withPosition,
  type MatrixService,
} from "./service-types";

describe("service types", () => {
  it("validates a service type", () => {
    const ok = serviceTypeSchema.safeParse({
      name: "  Sunday   service ",
      startTime: "10:05",
      durationMinutes: "105",
      location: "",
      notes: "",
    });
    expect(ok.success && ok.data.name).toBe("Sunday service");
    expect(
      serviceTypeSchema.safeParse({
        name: "x",
        startTime: "25:00",
        durationMinutes: 60,
        location: "",
        notes: "",
      }).success,
    ).toBe(false);
  });

  it("turns a first date and a count into dates", () => {
    const parsed = createServicesSchema.safeParse({
      firstDate: "2026-11-08",
      count: "3",
      everyWeeks: "1",
    });
    expect(parsed.success && parsed.data).toEqual(["2026-11-08", "2026-11-15", "2026-11-22"]);
    expect(
      createServicesSchema.safeParse({ firstDate: "2026-11-08", count: 60, everyWeeks: 1 }).success,
    ).toBe(false);
  });

  it("labels the time and length", () => {
    expect(serviceTimeLabel("10:05", 105)).toBe("10:05 a.m. · 1 h 45 min");
    expect(serviceTimeLabel("18:00", 60)).toBe("6:00 p.m. · 1 h");
  });

  it("edits the list of positions", () => {
    expect(withPosition(["a"], "b")).toEqual(["a", "b"]);
    expect(withoutPosition(["a", "b", "a"], 2)).toEqual(["a", "b"]);
    expect(movePosition(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(movePosition(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("maps database errors", () => {
    expect(toServiceTypeError({ message: "duplicate_name" })).toBe("duplicate_name");
    expect(toServiceTypeError({ code: "42501", message: "x" })).toBe("not_authorized");
    expect(toServiceTypeError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});

describe("buildMatrix", () => {
  const position = (id: string, roleId: string, sortOrder: number, name: string | null) => ({
    id,
    roleId,
    roleName: roleId === "cam" ? "Camera" : "Audio",
    departmentName: roleId === "cam" ? "Camera Operations" : "Audio",
    sortOrder,
    person: name ? { name, status: "confirmed" as const } : null,
  });

  it("lines up positions across services, with repeated roles as separate rows", () => {
    const services: MatrixService[] = [
      {
        id: "s1",
        startsAt: "2026-11-08T16:05:00Z",
        positions: [
          position("p1", "cam", 10, "Avery"),
          position("p2", "cam", 20, null),
          position("p3", "aud", 30, "Blake"),
        ],
      },
      {
        id: "s2",
        startsAt: "2026-11-15T16:05:00Z",
        positions: [position("p4", "aud", 10, null), position("p5", "cam", 20, "Casey")],
      },
    ];
    const rows = buildMatrix(services);
    expect(rows.map((r) => r.label)).toEqual(["Camera", "Camera (2)", "Audio"]);
    expect(rows[0]!.cells.map((c) => c?.person?.name ?? null)).toEqual(["Avery", "Casey"]);
    expect(rows[1]!.cells.map((c) => c?.id ?? null)).toEqual(["p2", null]);
    expect(rows[2]!.cells.map((c) => c?.id ?? null)).toEqual(["p3", "p4"]);
  });
});
