/**
 * Mentoring (SRS-MENTOR-001..005, SRS-RBAC-006). Pure validation and labels. Private notes are
 * readable only by their author; the database enforces it with a policy of its own.
 */
import { z } from "zod";

export type NoteVisibility = "shared" | "private";
export type GoalStatus = "open" | "done";

export const goalSchema = z.object({
  title: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Write the goal.").max(200, "Keep the goal under 200 characters.")),
  dueOn: z.union([
    z.literal("").transform(() => null),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  ]),
});

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(4000, "Keep the note under 4,000 characters."),
  visibility: z.enum(["shared", "private"]),
});

/** A goal is overdue when it's open and its due date (Winnipeg) has passed. */
export function goalOverdue(
  goal: { status: GoalStatus; dueOn: string | null },
  today: string,
): boolean {
  return goal.status === "open" && goal.dueOn !== null && goal.dueOn < today;
}

export type MentoringError =
  | "not_authorized"
  | "cannot_mentor_self"
  | "mentor_not_eligible"
  | "mentee_not_member"
  | "already_paired"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<MentoringError>([
  "not_authorized",
  "cannot_mentor_self",
  "mentor_not_eligible",
  "mentee_not_member",
  "already_paired",
]);

export function toMentoringError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): MentoringError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as MentoringError;
  }
  return error?.code === "42501" ? "not_authorized" : "unknown";
}

export function mentoringErrorMessage(error: MentoringError): string {
  switch (error) {
    case "not_authorized":
      return "You can't do that for this pairing.";
    case "cannot_mentor_self":
      return "Choose two different people.";
    case "mentor_not_eligible":
      return "Mentors need to be a trainer or leader for this department.";
    case "mentee_not_member":
      return "The volunteer needs to be an active member of the department.";
    case "already_paired":
      return "They're already paired.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
