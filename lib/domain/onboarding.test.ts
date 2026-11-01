import { describe, expect, it } from "vitest";
import {
  cameInByLabel,
  dueLabel,
  eventLabel,
  dueWithin,
  planStepDrop,
  planStepMove,
  STEP_CONFIG,
  STEP_KINDS,
  stepSummary,
  volunteerPathways,
  whoReachesOut,
  type MyOnboardingRow,
} from "./onboarding";

const ROLE = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const names = {
  roles: new Map([[ROLE, "Production Directors"]]),
  people: new Map([[PERSON, "G Adeojo"]]),
};

describe("step kinds", () => {
  it("marks which steps wait", () => {
    expect(STEP_KINDS.task.waits).toBe(true);
    expect(STEP_KINDS.course.waits).toBe(true);
    expect(STEP_KINDS.email.waits).toBe(false);
    expect(STEP_KINDS.trigger_pco.available).toBe(false);
  });
});

describe("step settings", () => {
  it("needs a person when a follow-up always goes to one", () => {
    expect(STEP_CONFIG.task.safeParse({ mode: "person", role_id: ROLE }).success).toBe(false);
    expect(STEP_CONFIG.task.safeParse({ mode: "person", person_id: PERSON }).success).toBe(true);
  });

  it("needs the leaders a follow-up comes from when taking turns or claiming", () => {
    expect(STEP_CONFIG.task.safeParse({ mode: "turns" }).success).toBe(false);
    const parsed = STEP_CONFIG.task.parse({ mode: "claim", role_id: ROLE, due_hours: "48" });
    expect(parsed.due_hours).toBe(48);
  });

  it("needs a subject and message for an email", () => {
    expect(STEP_CONFIG.email.safeParse({ subject: " ", body: "Hi" }).success).toBe(false);
    expect(STEP_CONFIG.email.safeParse({ subject: "Welcome", body: "Hi" }).success).toBe(true);
  });
});

describe("how a step reads", () => {
  it("says who reaches out", () => {
    expect(whoReachesOut({ mode: "turns", role_id: ROLE }, names)).toBe(
      "Production Directors, taking turns",
    );
    expect(whoReachesOut({ mode: "claim", role_id: ROLE }, names)).toBe(
      "First of the Production Directors to claim it",
    );
    expect(whoReachesOut({ mode: "person", person_id: PERSON }, names)).toBe("G Adeojo");
  });

  it("sums up a follow-up and a wait", () => {
    expect(stepSummary("task", { mode: "turns", role_id: ROLE, due_hours: 72 }, names)).toBe(
      "Production Directors, taking turns · due within 3 days",
    );
    expect(stepSummary("wait", { days: 1 })).toBe("1 day");
    expect(stepSummary("email", {})).toBe("No subject yet");
  });

  it("writes due times plainly", () => {
    expect(dueWithin(24)).toBe("1 day");
    expect(dueWithin(36)).toBe("36 hours");
    const now = new Date("2026-11-01T12:00:00Z");
    expect(dueLabel("2026-11-03T12:00:00Z", now)).toBe("Due in 2 days");
    expect(dueLabel("2026-10-31T12:00:00Z", now)).toBe("Overdue by 1 day");
    expect(dueLabel("2026-11-01T13:00:00Z", now)).toBe("Due today");
  });
});

describe("reordering", () => {
  const stages = [
    { id: "a", steps: [{ id: "1" }, { id: "2" }] },
    { id: "b", steps: [{ id: "3" }] },
  ];

  it("swaps within a stage", () => {
    expect(planStepMove(stages, "2", "up")).toEqual([
      { id: "2", stageId: "a", sortOrder: 10 },
      { id: "1", stageId: "a", sortOrder: 20 },
    ]);
  });

  it("crosses into the next stage at an edge", () => {
    const moved = planStepMove(stages, "2", "down");
    expect(moved).toContainEqual({ id: "2", stageId: "b", sortOrder: 10 });
    expect(moved).toContainEqual({ id: "3", stageId: "b", sortOrder: 20 });
  });

  it("does nothing past the very start or end", () => {
    expect(planStepMove(stages, "1", "up")).toEqual([]);
    expect(planStepMove(stages, "3", "down")).toEqual([]);
  });

  it("drops a step at a position, even within its own stage", () => {
    expect(planStepDrop(stages, "3", "a", 1)).toEqual([
      { id: "1", stageId: "a", sortOrder: 10 },
      { id: "3", stageId: "a", sortOrder: 20 },
      { id: "2", stageId: "a", sortOrder: 30 },
      // Stage b is now empty, so it has nothing to renumber.
    ]);
    expect(planStepDrop(stages, "1", "a", 2)).toEqual([
      { id: "2", stageId: "a", sortOrder: 10 },
      { id: "1", stageId: "a", sortOrder: 20 },
    ]);
  });
});

describe("the volunteer's view", () => {
  const row = (
    stepPosition: number,
    stepKind: MyOnboardingRow["stepKind"],
    stepTitle: string,
  ): MyOnboardingRow => ({
    entryId: "e",
    pathwayName: "Join the team",
    status: "active",
    stepTitle,
    stepKind,
    stepPosition,
    currentPosition: 4,
    contactName: "G Adeojo",
  });

  it("marks done, now, next and later, and hides leaders-only steps", () => {
    const [pathway] = volunteerPathways([
      row(2, "email", "Welcome email"),
      row(3, "notify", "Tell the directors"),
      row(4, "task", "Meet them"),
      row(5, "course", "Guide to Serving"),
      row(6, "branch", "Choose a department"),
    ]);
    expect(pathway?.steps).toEqual([
      { title: "Welcome email", state: "done" },
      { title: "A short chat with a leader", state: "now" },
      { title: "Guide to Serving", state: "next" },
      { title: "Choose a department", state: "later" },
    ]);
    expect(pathway?.nowNumber).toBe(2);
    expect(pathway?.contactName).toBe("G Adeojo");
    expect(pathway?.choosing).toBe(false);
  });
});

describe("history wording", () => {
  it("says how someone came in and what happened", () => {
    expect(cameInByLabel("manual")).toBe("a leader adding them");
    expect(eventLabel("started", "form")).toBe("Came in through the “I want to serve” page");
    expect(eventLabel("task_assigned", "Alex Example")).toBe("Handed to Alex Example");
    expect(eventLabel("finished", "")).toBe("Onboarding complete");
  });
});
