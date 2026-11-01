/**
 * Onboarding pathways (docs/decisions/2026-11-01-onboarding-pathways.md). Pure rules: the kinds of
 * step, what each needs, how a step reads, reordering, and the volunteer's progress. The database
 * engine (private.onboarding_run) moves people on; nothing here decides a result.
 */
import { z } from "zod";

export type StepKind =
  | "trigger_form"
  | "trigger_manual"
  | "trigger_join"
  | "trigger_pco"
  | "email"
  | "notify"
  | "task"
  | "mentor"
  | "course"
  | "wait"
  | "pco_team"
  | "branch"
  | "finish";

export type StepGroup = "Ways in" | "Automatic" | "Waits for" | "Then";
export type StepTone = "blue" | "violet" | "orange" | "green" | "grey" | "pink";

export const STEP_KINDS: Record<
  StepKind,
  {
    label: string;
    group: StepGroup;
    waits: boolean;
    tone: StepTone;
    hint: string;
    available: boolean;
  }
> = {
  trigger_form: {
    label: "“I want to serve” page",
    group: "Ways in",
    waits: false,
    tone: "blue",
    hint: "Someone fills in the public page or scans its QR code",
    available: true,
  },
  trigger_manual: {
    label: "Leader adds them",
    group: "Ways in",
    waits: false,
    tone: "blue",
    hint: "A leader enters a name and email",
    available: true,
  },
  trigger_join: {
    label: "Joins the department",
    group: "Ways in",
    waits: false,
    tone: "blue",
    hint: "Becomes a member, by request or invitation",
    available: true,
  },
  trigger_pco: {
    label: "Planning Center workflow",
    group: "Ways in",
    waits: false,
    tone: "blue",
    hint: "Only for churches that use Planning Center workflows (not set up)",
    available: false,
  },
  email: {
    label: "Send an email",
    group: "Automatic",
    waits: false,
    tone: "violet",
    hint: "To the volunteer; held until emails are switched on",
    available: true,
  },
  notify: {
    label: "Notify leaders",
    group: "Automatic",
    waits: false,
    tone: "violet",
    hint: "In the Academy, and by email if they choose",
    available: true,
  },
  task: {
    label: "Follow-up task",
    group: "Waits for",
    waits: true,
    tone: "orange",
    hint: "Pauses until a leader ticks it",
    available: true,
  },
  mentor: {
    label: "Pair a mentor",
    group: "Waits for",
    waits: true,
    tone: "violet",
    hint: "A leader pairs them in Mentoring, then ticks it",
    available: true,
  },
  course: {
    label: "Assign a course",
    group: "Waits for",
    waits: true,
    tone: "green",
    hint: "Moves on when the Academy records it finished",
    available: true,
  },
  wait: {
    label: "Wait some days",
    group: "Waits for",
    waits: true,
    tone: "grey",
    hint: "Pauses for a set time",
    available: true,
  },
  pco_team: {
    label: "Add to a team in Planning Center",
    group: "Waits for",
    waits: true,
    tone: "pink",
    hint: "Completes itself when the sync sees them on the team",
    available: true,
  },
  branch: {
    label: "Choose a department",
    group: "Then",
    waits: true,
    tone: "pink",
    hint: "They pick; that department's pathway starts",
    available: true,
  },
  finish: {
    label: "Finish",
    group: "Then",
    waits: false,
    tone: "green",
    hint: "Onboarding complete",
    available: true,
  },
};

export const STEP_GROUPS: readonly StepGroup[] = ["Ways in", "Automatic", "Waits for", "Then"];

export function isTrigger(kind: StepKind): boolean {
  return kind.startsWith("trigger_");
}

const uuid = z.uuid();
const optionalUuid = z
  .union([uuid, z.literal("")])
  .optional()
  .transform((value) => value || undefined);

export const ASSIGN_MODES = ["turns", "claim", "person"] as const;
export type AssignMode = (typeof ASSIGN_MODES)[number];
export const ASSIGN_MODE_LABELS: Record<AssignMode, { label: string; hint: string }> = {
  turns: { label: "Take turns", hint: "New people go to each of them in turn." },
  claim: {
    label: "First to claim it",
    hint: "Everyone sees it in Follow-ups; one presses “I'll take this”.",
  },
  person: { label: "A specific person", hint: "Always the same leader." },
};

const taskConfig = z
  .object({
    role_id: optionalUuid,
    mode: z.enum(ASSIGN_MODES).default("turns"),
    person_id: optionalUuid,
    due_hours: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(72),
    detail: z.string().trim().max(1000).default(""),
  })
  .refine((c) => c.mode !== "person" || c.person_id, {
    message: "Choose who it goes to.",
    path: ["person_id"],
  })
  .refine((c) => c.mode === "person" || c.role_id, {
    message: "Choose which leaders it comes from.",
    path: ["role_id"],
  });

/** What each kind of step needs, checked before it's saved (the database stores it as JSON). */
export const STEP_CONFIG = {
  trigger_form: z.object({}),
  trigger_manual: z.object({}),
  trigger_join: z.object({}),
  trigger_pco: z.object({}),
  email: z.object({
    subject: z.string().trim().min(1, "Give the email a subject.").max(150),
    body: z.string().trim().min(1, "Write the message.").max(3000),
  }),
  notify: z.object({ role_id: optionalUuid }),
  task: taskConfig,
  mentor: taskConfig,
  course: z.object({ course_id: uuid }),
  wait: z.object({ days: z.coerce.number().int().min(1).max(60).default(3) }),
  pco_team: z.object({ serving_role_id: uuid }),
  branch: z.object({}),
  finish: z.object({}),
} satisfies Record<StepKind, z.ZodType>;

export type StepConfig = Record<string, unknown>;

/** A step as it reads in the builder: "Production Directors, taking turns · due within 3 days". */
export function stepSummary(
  kind: StepKind,
  config: StepConfig,
  names: {
    roles?: ReadonlyMap<string, string>;
    people?: ReadonlyMap<string, string>;
    courses?: ReadonlyMap<string, string>;
    servingRoles?: ReadonlyMap<string, string>;
  } = {},
): string {
  const text = (key: string) => (typeof config[key] === "string" ? (config[key] as string) : "");
  const num = (key: string, fallback: number) =>
    typeof config[key] === "number" ? (config[key] as number) : Number(config[key]) || fallback;
  switch (kind) {
    case "email":
      return text("subject") ? `Subject: ${text("subject")}` : "No subject yet";
    case "notify":
      return text("role_id")
        ? `Tells the ${names.roles?.get(text("role_id")) ?? "chosen leaders"}`
        : "Tells the leaders who look after this pathway";
    case "task":
    case "mentor":
      return `${whoReachesOut(config, names)} · due within ${dueWithin(num("due_hours", 72))}`;
    case "course":
      return names.courses?.get(text("course_id")) ?? "Choose a course";
    case "wait": {
      const days = num("days", 3);
      return days === 1 ? "1 day" : `${days} days`;
    }
    case "pco_team":
      return names.servingRoles?.get(text("serving_role_id")) ?? "Choose a position";
    default:
      return STEP_KINDS[kind].hint;
  }
}

/** "G Adeojo", "Production Directors, taking turns", or "First of the Production Directors to claim it". */
export function whoReachesOut(
  config: StepConfig,
  names: { roles?: ReadonlyMap<string, string>; people?: ReadonlyMap<string, string> } = {},
): string {
  const role = names.roles?.get(String(config.role_id ?? "")) ?? "leaders";
  switch (config.mode) {
    case "person":
      return names.people?.get(String(config.person_id ?? "")) ?? "Choose a person";
    case "claim":
      return `First of the ${role} to claim it`;
    default:
      return `${role}, taking turns`;
  }
}

export function dueWithin(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** "Due in 2 days", "Due today", "Overdue by 1 day". */
export function dueLabel(dueAt: string | null, now: Date): string {
  if (!dueAt) {
    return "No due date";
  }
  const days = Math.round((Date.parse(dueAt) - now.getTime()) / 86_400_000);
  if (days < 0) {
    return `Overdue by ${-days === 1 ? "1 day" : `${-days} days`}`;
  }
  if (days === 0) {
    return "Due today";
  }
  return `Due in ${days === 1 ? "1 day" : `${days} days`}`;
}

export function isOverdue(dueAt: string | null, now: Date): boolean {
  return dueAt !== null && Date.parse(dueAt) < now.getTime();
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

export type OrderedStage = { id: string; steps: { id: string }[] };
export type StepPlacement = { id: string; stageId: string; sortOrder: number };

/**
 * Moves a step one place up or down, crossing into the stage before or after when it's at an edge.
 * Returns the new placement of every step in the stages that changed, numbered 10, 20, 30.
 */
export function planStepMove(
  stages: readonly OrderedStage[],
  stepId: string,
  direction: "up" | "down",
): StepPlacement[] {
  const copy = stages.map((stage) => ({ id: stage.id, steps: stage.steps.map((s) => s.id) }));
  const si = copy.findIndex((stage) => stage.steps.includes(stepId));
  if (si < 0) {
    return [];
  }
  const stage = copy[si]!;
  const i = stage.steps.indexOf(stepId);
  const touched = new Set([si]);
  if (direction === "up") {
    if (i > 0) {
      [stage.steps[i - 1], stage.steps[i]] = [stage.steps[i]!, stage.steps[i - 1]!];
    } else if (si > 0) {
      stage.steps.splice(i, 1);
      copy[si - 1]!.steps.push(stepId);
      touched.add(si - 1);
    } else {
      return [];
    }
  } else if (i < stage.steps.length - 1) {
    [stage.steps[i + 1], stage.steps[i]] = [stage.steps[i]!, stage.steps[i + 1]!];
  } else if (si < copy.length - 1) {
    stage.steps.splice(i, 1);
    copy[si + 1]!.steps.unshift(stepId);
    touched.add(si + 1);
  } else {
    return [];
  }
  return [...touched].flatMap((index) =>
    copy[index]!.steps.map((id, n) => ({ id, stageId: copy[index]!.id, sortOrder: (n + 1) * 10 })),
  );
}

/** Places a step at a position in a stage (drag and drop), renumbering the stages involved. */
export function planStepDrop(
  stages: readonly OrderedStage[],
  stepId: string,
  toStageId: string,
  toIndex: number,
): StepPlacement[] {
  const copy = stages.map((stage) => ({ id: stage.id, steps: stage.steps.map((s) => s.id) }));
  const from = copy.find((stage) => stage.steps.includes(stepId));
  const to = copy.find((stage) => stage.id === toStageId);
  if (!from || !to) {
    return [];
  }
  const fromIndex = from.steps.indexOf(stepId);
  from.steps.splice(fromIndex, 1);
  const index = Math.max(
    0,
    Math.min(from === to && fromIndex < toIndex ? toIndex - 1 : toIndex, to.steps.length),
  );
  to.steps.splice(index, 0, stepId);
  return [...new Set([from, to])].flatMap((stage) =>
    stage.steps.map((id, n) => ({ id, stageId: stage.id, sortOrder: (n + 1) * 10 })),
  );
}

// ---------------------------------------------------------------------------
// The volunteer's view
// ---------------------------------------------------------------------------

export type MyOnboardingRow = {
  entryId: string;
  pathwayName: string;
  status: "active" | "finished" | "stopped";
  stepTitle: string;
  stepKind: StepKind;
  stepPosition: number;
  currentPosition: number | null;
  contactName: string | null;
};

export type VolunteerStep = { title: string; state: "done" | "now" | "next" | "later" };
export type VolunteerPathway = {
  entryId: string;
  name: string;
  finished: boolean;
  steps: VolunteerStep[];
  /** 1-based, among the steps shown. */
  nowNumber: number | null;
  contactName: string | null;
  choosing: boolean;
};

/** Plain words for the volunteer: leaders' internal steps become what they'll notice. */
export function volunteerTitle(kind: StepKind, title: string): string {
  switch (kind) {
    case "task":
      return "A short chat with a leader";
    case "mentor":
      return "Meet your mentor";
    case "pco_team":
      return "Join the team in Planning Center";
    case "notify":
      return "";
    default:
      return title;
  }
}

/** Groups my_onboarding() rows by pathway and marks each step done, now, next, or later. */
export function volunteerPathways(rows: readonly MyOnboardingRow[]): VolunteerPathway[] {
  const byEntry = new Map<string, MyOnboardingRow[]>();
  for (const row of rows) {
    byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row]);
  }
  return [...byEntry.values()].map((list) => {
    const first = list[0]!;
    const finished = first.status === "finished";
    const visible = list
      .toSorted((a, b) => a.stepPosition - b.stepPosition)
      .filter((row) => volunteerTitle(row.stepKind, row.stepTitle) !== "");
    let seenNow = false;
    let nowNumber: number | null = null;
    const steps = visible.map((row, n): VolunteerStep => {
      const current = first.currentPosition;
      let state: VolunteerStep["state"];
      if (finished || (current !== null && row.stepPosition < current)) {
        state = "done";
      } else if (!seenNow) {
        state = "now";
        seenNow = true;
        nowNumber = n + 1;
      } else {
        state = "later";
      }
      return { title: volunteerTitle(row.stepKind, row.stepTitle), state };
    });
    const nowRow = visible[(nowNumber ?? 0) - 1];
    return {
      entryId: first.entryId,
      name: first.pathwayName,
      finished,
      steps: markNext(steps),
      nowNumber,
      contactName: first.contactName,
      choosing: nowRow?.stepKind === "branch",
    };
  });
}

/** The first step after "now" is "next"; the rest stay "later". */
function markNext(steps: VolunteerStep[]): VolunteerStep[] {
  const now = steps.findIndex((s) => s.state === "now");
  return steps.map((step, i) => (now >= 0 && i === now + 1 ? { ...step, state: "next" } : step));
}
