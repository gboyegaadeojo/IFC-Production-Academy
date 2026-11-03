import { describe, expect, it } from "vitest";
import {
  ALL_PRODUCTION_LABEL,
  ALL_PRODUCTION_VALUE,
  groupSopsByCategory,
  NO_CATEGORY_LABEL,
  sopAudience,
  sopCategories,
  sopCreateSchema,
} from "./sops";

const ID = "b7ba9dae-cab5-43e0-a996-8ae9d2436855";

describe("sopAudience", () => {
  it("names the department, or all of production when there's none", () => {
    expect(sopAudience({ name: "Camera Directing" })).toBe("Camera Directing");
    expect(sopAudience(null)).toBe(ALL_PRODUCTION_LABEL);
  });
});

describe("sopCategories", () => {
  it("lists each category once, alphabetically, with uncategorised last", () => {
    expect(
      sopCategories([
        { category: "Setup" },
        { category: "" },
        { category: "Copyright" },
        { category: "Setup" },
      ]),
    ).toEqual(["Copyright", "Setup", NO_CATEGORY_LABEL]);
  });
});

describe("groupSopsByCategory", () => {
  it("groups by category and puts what needs attention first", () => {
    const groups = groupSopsByCategory([
      { category: "Setup", title: "B current", state: "current" as const },
      { category: "Setup", title: "A current", state: "current" as const },
      { category: "Setup", title: "Z due", state: "review_due" as const },
      { category: "Setup", title: "Y draft", state: "not_published" as const },
      { category: "", title: "Loose", state: "current" as const },
    ]);
    expect(groups.map((group) => group.name)).toEqual(["Setup", NO_CATEGORY_LABEL]);
    expect(groups[0]?.sops.map((sop) => sop.title)).toEqual([
      "Z due",
      "Y draft",
      "A current",
      "B current",
    ]);
    expect(groups[1]?.sops.map((sop) => sop.title)).toEqual(["Loose"]);
  });
});

describe("sopCreateSchema", () => {
  const valid = { departmentId: ID, title: "Camera setup", category: "Setup" };

  it("takes a department or all of production", () => {
    expect(sopCreateSchema.safeParse(valid).success).toBe(true);
    expect(
      sopCreateSchema.safeParse({ ...valid, departmentId: ALL_PRODUCTION_VALUE }).success,
    ).toBe(true);
  });

  it("refuses anything else as who it's for", () => {
    const result = sopCreateSchema.safeParse({ ...valid, departmentId: "marketing" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Choose who it's for.");
    expect(sopCreateSchema.safeParse({ ...valid, departmentId: null }).success).toBe(false);
  });

  it("tidies the category and limits its length", () => {
    expect(sopCreateSchema.parse({ ...valid, category: "  Service   day " }).category).toBe(
      "Service day",
    );
    expect(sopCreateSchema.parse({ ...valid, category: "" }).category).toBe("");
    expect(sopCreateSchema.safeParse({ ...valid, category: "x".repeat(61) }).success).toBe(false);
  });
});
