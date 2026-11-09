/**
 * A service's order of service (plan "Academy scheduling", PR 6): items, songs, and section
 * headers, each with a length and notes for departments. Pure helpers for the editor and for
 * checking what's sent to the database, which checks again.
 */
import { z } from "zod";
import { utcToWinnipeg, winnipegToUtc } from "./schedule";

export const PLAN_ITEM_KINDS = ["item", "song", "header"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const PLAN_ITEM_KIND_LABELS: Record<PlanItemKind, string> = {
  item: "Item",
  song: "Song",
  header: "Header",
};

export type PlanNote = { category: string; content: string };

export type PlanItem = {
  /** Kept for items already saved, so anything recorded against them stays. */
  id: string | null;
  kind: PlanItemKind;
  title: string;
  lengthSeconds: number;
  notes: PlanNote[];
};

/** The longest item: four hours. */
export const MAX_ITEM_SECONDS = 4 * 60 * 60;

const noteSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1, "Choose who each note is for.")
    .max(60, "Keep note headings under 60 characters."),
  content: z
    .string()
    .trim()
    .min(1, "Write something in each note, or remove it.")
    .max(500, "Keep each note under 500 characters."),
});

export const planItemsSchema = z
  .array(
    z.object({
      id: z.string().max(100).nullable(),
      kind: z.enum(PLAN_ITEM_KINDS),
      title: z
        .string()
        .trim()
        .min(1, "Give every item a title.")
        .max(120, "Keep titles under 120 characters."),
      lengthSeconds: z.number().int().min(0).max(MAX_ITEM_SECONDS, "Keep items under four hours."),
      notes: z.array(noteSchema).max(20, "Up to 20 notes on an item."),
    }),
  )
  .max(150, "Up to 150 items in an order of service.");

export const templateNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z.string().min(1, "Give the template a name.").max(80, "Keep the name under 80 characters."),
  );

/** "4:30", "4", "0:45", or "" to seconds. Null when it isn't a length. */
export function parseLength(text: string): number | null {
  const value = text.trim();
  if (value === "") {
    return 0;
  }
  const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(value);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
  return seconds <= MAX_ITEM_SECONDS ? seconds : null;
}

/** 270 to "4:30". */
export function formatLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** When each item starts, from the top of the service, and the total. Headers take no time. */
export function planTimeline(items: readonly Pick<PlanItem, "kind" | "lengthSeconds">[]): {
  starts: number[];
  totalSeconds: number;
} {
  let running = 0;
  const starts = items.map((item) => {
    const start = running;
    if (item.kind !== "header") {
      running += item.lengthSeconds;
    }
    return start;
  });
  return { starts, totalSeconds: running };
}

const CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  hour: "numeric",
  minute: "2-digit",
});

/** The Winnipeg time a service starting at `startsAt` reaches after `seconds`: "11:58 a.m.". */
export function clockAfter(startsAt: string, seconds: number): string {
  return CLOCK.format(new Date(Date.parse(startsAt) + seconds * 1000));
}

/** What the database takes: snake_case, headers with no length. */
export function planPayload(items: readonly PlanItem[]) {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title.trim(),
    length_seconds: item.kind === "header" ? 0 : item.lengthSeconds,
    notes: item.notes.map((note) => ({
      category: note.category.trim(),
      content: note.content.trim(),
    })),
  }));
}

const storedItem = z.object({
  id: z.string().optional(),
  kind: z.enum(PLAN_ITEM_KINDS).catch("item"),
  title: z.string(),
  length_seconds: z.number().catch(0),
  notes: z.array(z.object({ category: z.string(), content: z.string() })).catch([]),
});

/** A template's stored items back to editor items. Anything unreadable is left out. */
export function itemsFromTemplate(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((raw) => {
    const parsed = storedItem.safeParse(raw);
    return parsed.success
      ? [
          {
            id: null,
            kind: parsed.data.kind,
            title: parsed.data.title,
            lengthSeconds: Math.max(0, Math.round(parsed.data.length_seconds)),
            notes: parsed.data.notes,
          },
        ]
      : [];
  });
}

// ---------------------------------------------------------------------------
// Extra times: rehearsal, sound check, anything else
// ---------------------------------------------------------------------------

export const EVENT_TIME_KINDS = ["rehearsal", "sound_check", "other"] as const;
export type EventTimeKind = (typeof EVENT_TIME_KINDS)[number];

export const EVENT_TIME_LABELS: Record<EventTimeKind, string> = {
  rehearsal: "Rehearsal",
  sound_check: "Sound check",
  other: "Other",
};

export type EventTime = {
  kind: EventTimeKind;
  label: string;
  /** Winnipeg "HH:MM" on the service's day. */
  start: string;
  end: string;
};

export const eventTimesSchema = z
  .array(
    z
      .object({
        kind: z.enum(EVENT_TIME_KINDS),
        label: z.string().trim().max(60, "Keep labels under 60 characters."),
        start: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time."),
        end: z.string().regex(/^\d{2}:\d{2}$/, "Choose an end time."),
      })
      .refine((time) => time.end > time.start, {
        message: "Each time needs to end after it starts.",
      }),
  )
  .max(10, "Up to 10 extra times.");

/** Extra times on the service's Winnipeg day, as the database takes them. */
export function timesPayload(serviceStartsAt: string, times: readonly EventTime[]) {
  const [day] = utcToWinnipeg(serviceStartsAt);
  return times.map((time) => ({
    kind: time.kind,
    label: time.label.trim(),
    starts_at: winnipegToUtc(day, time.start)?.toISOString() ?? null,
    ends_at: winnipegToUtc(day, time.end)?.toISOString() ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Errors from the database
// ---------------------------------------------------------------------------

export type PlanError =
  | "not_authorized"
  | "managed_in_planning_center"
  | "event_closed"
  | "invalid_plan"
  | "invalid_times"
  | "template_not_found"
  | "name_taken"
  | "unknown";

const PLAN_ERRORS: ReadonlySet<string> = new Set<PlanError>([
  "not_authorized",
  "managed_in_planning_center",
  "event_closed",
  "invalid_plan",
  "invalid_times",
  "template_not_found",
  "name_taken",
]);

export function toPlanError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): PlanError {
  if (error?.message && PLAN_ERRORS.has(error.message)) {
    return error.message as PlanError;
  }
  return error?.code === "42501" ? "not_authorized" : "unknown";
}

export function planErrorMessage(error: PlanError): string {
  switch (error) {
    case "not_authorized":
      return "Only schedulers can do that.";
    case "managed_in_planning_center":
      return "Planning Center plans this service, so change it there.";
    case "event_closed":
      return "This service is over or cancelled.";
    case "invalid_plan":
      return "Check the order of service: every item needs a title, and every note a heading.";
    case "invalid_times":
      return "Check the times: each needs to end after it starts.";
    case "template_not_found":
      return "That plan template isn't there any more.";
    case "name_taken":
      return "There's already a plan template with that name.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
