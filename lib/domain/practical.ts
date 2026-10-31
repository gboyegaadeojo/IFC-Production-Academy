/**
 * Practical assessments (SRS-ASSESS-001..008). The observer records what they saw; the system works
 * out Pass or Further Practice Required from the leader's pass rule (decided 2026-10-30). The
 * database is the authority; practicalOutcome mirrors its rule so pages can explain a result.
 */
import { z } from "zod";

export type PracticalOutcome = "pass" | "further_practice";

export type PassRule = { requireAllRequired: boolean; passMinPercent: number };

export const DEFAULT_PASS_RULE: PassRule = { requireAllRequired: true, passMinPercent: 80 };

/** The same rule as record_practical_assessment. */
export function practicalOutcome(
  criteria: readonly { id: string; isRequired: boolean }[],
  observedIds: ReadonlySet<string>,
  rule: PassRule,
): PracticalOutcome {
  if (criteria.length === 0) {
    return "further_practice";
  }
  const observed = criteria.filter((c) => observedIds.has(c.id));
  const requiredMet = criteria.every((c) => !c.isRequired || observedIds.has(c.id));
  const shareMet = observed.length * 100 >= rule.passMinPercent * criteria.length;
  return (!rule.requireAllRequired || requiredMet) && shareMet ? "pass" : "further_practice";
}

export function passRuleLabel(rule: PassRule): string {
  const share =
    rule.passMinPercent === 100
      ? "every item"
      : rule.passMinPercent === 0
        ? null
        : `at least ${rule.passMinPercent}% of all items`;
  if (rule.requireAllRequired && share) {
    return `To pass: every required item, and ${share}`;
  }
  if (rule.requireAllRequired) {
    return "To pass: every required item";
  }
  return share ? `To pass: ${share}` : "Every assessment passes";
}

export const OUTCOME_LABELS: Record<PracticalOutcome, string> = {
  pass: "Pass",
  further_practice: "Further practice required",
};

export type AssessmentSummary = {
  id: string;
  outcome: PracticalOutcome;
  assessedAt: string;
  voidedAt: string | null;
};

export type PracticalState = "not_assessed" | "requested" | "further_practice" | "passed";

export const PRACTICAL_STATE_LABELS: Record<PracticalState, string> = {
  not_assessed: "Not assessed yet",
  requested: "Assessment requested",
  further_practice: "Further practice required",
  passed: "Passed",
};

/** Where a learner stands on one practical, ignoring voided assessments. */
export function practicalState(
  assessments: readonly AssessmentSummary[],
  hasOpenRequest: boolean,
): PracticalState {
  const valid = assessments
    .filter((a) => a.voidedAt === null)
    .toSorted((a, b) => (a.assessedAt < b.assessedAt ? 1 : -1));
  if (valid.some((a) => a.outcome === "pass")) {
    return "passed";
  }
  if (hasOpenRequest) {
    return "requested";
  }
  return valid.length > 0 ? "further_practice" : "not_assessed";
}

/** When the next assessment may happen after Further Practice Required. Null: any time. */
export function nextAssessmentAt(
  lastFurtherPracticeAt: string | null,
  retryWaitDays: number,
): Date | null {
  if (lastFurtherPracticeAt === null || retryWaitDays === 0) {
    return null;
  }
  return new Date(new Date(lastFurtherPracticeAt).getTime() + retryWaitDays * 86_400_000);
}

// ---------------------------------------------------------------------------
// Editor validation
// ---------------------------------------------------------------------------

const titleField = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."));

const placementField = z.union([z.literal("end"), z.uuid()]);

export const newPracticalSchema = z.object({ title: titleField, placement: placementField });

export const practicalSettingsSchema = z.object({
  title: titleField,
  intro: z.string().trim().max(1000, "Keep the introduction under 1,000 characters."),
  placement: placementField,
  competencyId: z.union([z.literal("none").transform(() => null), z.uuid()]),
  isRequired: z.boolean(),
  requireAllRequired: z.boolean(),
  passMinPercent: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(0, "Use 0 to 100.")
    .max(100, "Use 0 to 100."),
  retryWaitDays: z.coerce
    .number()
    .int("Enter whole days.")
    .min(0, "Use 0 to 90 days.")
    .max(90, "Use 0 to 90 days."),
});

export type PracticalSettings = z.output<typeof practicalSettingsSchema>;

export const criterionSchema = z.object({
  label: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "Describe what the observer should see.")
        .max(200, "Keep it under 200 characters."),
    ),
  description: z.string().trim().max(500, "Keep the description under 500 characters."),
  isRequired: z.boolean(),
});

export const feedbackSchema = z
  .string()
  .trim()
  .max(2000, "Keep the feedback under 2,000 characters.");

// ---------------------------------------------------------------------------
// Errors from the database
// ---------------------------------------------------------------------------

export type PracticalError =
  | "not_authorized"
  | "cannot_assess_self"
  | "learner_not_member"
  | "already_passed"
  | "reassessment_too_soon"
  | "practical_has_no_criteria"
  | "reason_required"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<PracticalError>([
  "not_authorized",
  "cannot_assess_self",
  "learner_not_member",
  "already_passed",
  "reassessment_too_soon",
  "practical_has_no_criteria",
  "reason_required",
]);

export function toPracticalError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): PracticalError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as PracticalError;
  }
  if (error?.code === "42501") {
    return "not_authorized";
  }
  return "unknown";
}

export function practicalErrorMessage(error: PracticalError): string {
  switch (error) {
    case "not_authorized":
      return "Only trainers and leaders for this department can do that.";
    case "cannot_assess_self":
      return "You can't assess yourself. Ask another trainer.";
    case "learner_not_member":
      return "They need to be an active member of the department first.";
    case "already_passed":
      return "They've already passed this practical.";
    case "reassessment_too_soon":
      return "It's too soon to reassess. This practical asks for time to practise between assessments.";
    case "practical_has_no_criteria":
      return "This practical has no checklist items yet.";
    case "reason_required":
      return "Say why, so the record makes sense later.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
