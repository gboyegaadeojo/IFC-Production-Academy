import { describe, expect, it } from "vitest";
import {
  cameInByLabel,
  dueLabel,
  eventLabel,
  dueWithin,
  EMAIL_TEMPLATES,
  planStepDrop,
  planStepMove,
  STEP_CONFIG,
  STEP_KINDS,
  stepNeedsSetup,
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

describe("steps that need setting up", () => {
  it("flags a course step without a course, since people would stop there", () => {
    expect(stepNeedsSetup("course", {})).toMatch(/Choose a course/);
    expect(stepNeedsSetup("course", { course_id: "c1" })).toBeNull();
  });

  it("flags an email without a subject or message", () => {
    expect(stepNeedsSetup("email", { subject: "Hi" })).not.toBeNull();
    expect(stepNeedsSetup("email", { subject: "Hi", body: "Hello" })).toBeNull();
  });

  it("flags a Planning Center step without a position", () => {
    expect(stepNeedsSetup("pco_team", {})).not.toBeNull();
    expect(stepNeedsSetup("pco_team", { serving_role_id: "r1" })).toBeNull();
  });

  it("flags a follow-up given to one person without choosing them", () => {
    expect(stepNeedsSetup("task", { mode: "person" })).not.toBeNull();
    expect(stepNeedsSetup("task", { mode: "turns" })).toBeNull();
    expect(stepNeedsSetup("mentor", { mode: "person", person_id: "p1" })).toBeNull();
  });

  it("never flags steps with nothing to set", () => {
    for (const kind of ["notify", "wait", "branch", "finish", "trigger_form"] as const) {
      expect(stepNeedsSetup(kind, {})).toBeNull();
    }
  });
});

describe("email templates", () => {
  it("each has a unique key, a subject, and a message that passes the step's own rules", () => {
    const keys = new Set(EMAIL_TEMPLATES.map((t) => t.key));
    expect(keys.size).toBe(EMAIL_TEMPLATES.length);
    for (const t of EMAIL_TEMPLATES) {
      expect(STEP_CONFIG.email.safeParse({ subject: t.subject, body: t.body }).success).toBe(true);
      expect(stepNeedsSetup("email", { subject: t.subject, body: t.body })).toBeNull();
    }
  });

  it("only uses the {first name} placeholder, the one the sender fills in", () => {
    for (const t of EMAIL_TEMPLATES) {
      const placeholders = `${t.subject} ${t.body}`.match(/\{[^}]*\}/g) ?? [];
      expect(placeholders.every((p) => p === "{first name}")).toBe(true);
    }
  });
});

describe("choose a department", () => {
  const CAM = "33333333-3333-4333-8333-333333333333";
  const AUD = "44444444-4444-4444-8444-444444444444";

  it("saves the offered departments from the form's comma-separated list", () => {
    expect(STEP_CONFIG.branch.parse({ department_ids: `${CAM},${AUD}` })).toEqual({
      department_ids: [CAM, AUD],
    });
    expect(STEP_CONFIG.branch.parse({ department_ids: "" })).toEqual({ department_ids: [] });
    expect(STEP_CONFIG.branch.parse({})).toEqual({ department_ids: [] });
    expect(STEP_CONFIG.branch.safeParse({ department_ids: "not-a-uuid" }).success).toBe(false);
  });

  it("reads as every open department, or the ones it offers", () => {
    const departments = new Map([
      [CAM, "Camera Operations"],
      [AUD, "Audio Engineering"],
    ]);
    expect(stepSummary("branch", {})).toBe("They pick from every open department");
    expect(stepSummary("branch", { department_ids: [CAM] }, { departments })).toBe(
      "They pick from Camera Operations",
    );
  });

  it("gives the volunteer the offered list only while they're choosing", () => {
    const row = {
      entryId: "e1",
      pathwayName: "Join the team",
      status: "active" as const,
      contactName: null,
      currentPosition: 1,
    };
    const [pathway] = volunteerPathways([
      {
        ...row,
        stepTitle: "Pick",
        stepKind: "branch",
        stepPosition: 1,
        offeredDepartmentIds: [CAM],
      },
      {
        ...row,
        stepTitle: "Done",
        stepKind: "finish",
        stepPosition: 2,
        offeredDepartmentIds: null,
      },
    ]);
    expect(pathway?.choosing).toBe(true);
    expect(pathway?.offeredDepartmentIds).toEqual([CAM]);
  });
});
