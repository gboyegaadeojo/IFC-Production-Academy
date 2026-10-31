/**
 * Curriculum rules (SRS-CUR-001..008). Pure functions: no department or course is special.
 * Decided 2026-10-30: leaders publish their own department's curriculum; every publish is a
 * version with a change note, and old versions can be restored. Review is optional per department.
 */
import { z } from "zod";
import { parseVideo, type VideoRef } from "@/lib/domain/video";

export type CourseVersionStatus =
  "draft" | "pending_review" | "published" | "superseded" | "archived";

export type VersionSummary = {
  id: string;
  status: CourseVersionStatus;
  versionNumber: number | null;
  title: string;
};

export type CourseState =
  | { kind: "unpublished"; draftId: string; title: string }
  | {
      kind: "published";
      versionNumber: number;
      title: string;
      draftId: string | null;
      inReview: boolean;
    }
  | { kind: "archived"; title: string; draftId: string | null };

/** One line for a course in the curriculum list: what's live and whether changes are waiting. */
export function courseState(
  versions: readonly VersionSummary[],
  archived: boolean,
): CourseState | null {
  const open = versions.find((v) => v.status === "draft" || v.status === "pending_review");
  const published = versions.find((v) => v.status === "published");
  const latest = versions
    .filter((v) => v.versionNumber !== null)
    .toSorted((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))[0];

  if (archived) {
    const title = open?.title ?? latest?.title;
    return title === undefined ? null : { kind: "archived", title, draftId: open?.id ?? null };
  }
  if (published && published.versionNumber !== null) {
    return {
      kind: "published",
      versionNumber: published.versionNumber,
      title: published.title,
      draftId: open?.id ?? null,
      inReview: open?.status === "pending_review",
    };
  }
  if (open) {
    return { kind: "unpublished", draftId: open.id, title: open.title };
  }
  return null;
}

export function courseStateLabel(state: CourseState): string {
  switch (state.kind) {
    case "unpublished":
      return "Not published yet";
    case "published":
      if (state.inReview) {
        return `Version ${state.versionNumber} live · changes waiting for review`;
      }
      return state.draftId
        ? `Version ${state.versionNumber} live · unpublished changes`
        : `Version ${state.versionNumber} live`;
    case "archived":
      return "Archived";
  }
}

export const VERSION_STATUS_LABELS: Record<CourseVersionStatus, string> = {
  draft: "Draft",
  pending_review: "Waiting for review",
  published: "Live",
  superseded: "Earlier version",
  archived: "Archived",
};

// ---------------------------------------------------------------------------
// Validation (mirrors the database checks so people see plain messages first)
// ---------------------------------------------------------------------------

/** One objective per line; blank lines dropped. */
export function parseObjectives(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

const objectivesField = z
  .string()
  .max(5000)
  .transform(parseObjectives)
  .pipe(
    z
      .array(z.string().max(200, "Keep each objective under 200 characters."))
      .max(20, "List up to 20 objectives."),
  );

const minutesField = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number()
      .int("Enter whole minutes.")
      .min(1, "Enter at least 1 minute.")
      .max(max, `Enter no more than ${max} minutes.`)
      .optional(),
  );

const titleField = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."));

export const courseTitleSchema = titleField;

export const courseDetailsSchema = z.object({
  title: titleField,
  summary: z.string().trim().max(1000, "Keep the summary under 1,000 characters."),
  objectives: objectivesField,
  estimatedMinutes: minutesField(6000),
});

export const moduleSchema = z.object({
  title: titleField,
  summary: z.string().trim().max(1000, "Keep the summary under 1,000 characters."),
});

/**
 * A lesson's video: the source and what the leader typed (SRS-LESSON-003). An empty value means no
 * video. Stored as provider + reference, never as pasted embed code.
 */
export const videoField = z
  .object({
    provider: z.enum(["youtube", "nas"]).default("youtube"),
    input: z.string().trim().max(500, "That's too long. Paste the video's link or file path."),
  })
  .transform((value, context): VideoRef | null => {
    if (value.input === "") {
      return null;
    }
    const video = parseVideo(value.provider, value.input);
    if (!video) {
      context.addIssue({
        code: "custom",
        message:
          value.provider === "youtube"
            ? "That doesn't look like a YouTube video link. Paste the link from YouTube's Share button."
            : "Use the file's path inside the training videos folder, like camera/level-1/framing.mp4. MP4 and WebM files only.",
      });
      return z.NEVER;
    }
    return video;
  });

export const lessonSchema = z.object({
  moduleId: z.uuid(),
  title: titleField,
  summary: z.string().trim().max(1000, "Keep the summary under 1,000 characters."),
  objectives: objectivesField,
  estimatedMinutes: minutesField(600),
  isRequired: z.boolean(),
  body: z.string().max(20000, "Keep the lesson text under 20,000 characters."),
  video: videoField,
});

export const changeNoteSchema = z
  .string()
  .trim()
  .min(1, "Say briefly what changed, so people can follow the history.")
  .max(500, "Keep the change note under 500 characters.");

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Moves an item up or down and returns the new sort_order for every item whose order changed.
 * Orders are renumbered 10, 20, 30… so later inserts can go between.
 */
export function reorder<T extends { id: string; sortOrder: number }>(
  items: readonly T[],
  id: string,
  direction: "up" | "down",
): { id: string; sortOrder: number }[] {
  const ordered = items.toSorted((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((item) => item.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) {
    return [];
  }
  const moved = ordered.slice();
  const [item] = moved.splice(index, 1);
  if (!item) {
    return [];
  }
  moved.splice(target, 0, item);
  return moved
    .map((entry, position) => ({
      id: entry.id,
      sortOrder: (position + 1) * 10,
      before: entry.sortOrder,
    }))
    .filter((entry) => entry.sortOrder !== entry.before)
    .map(({ id: entryId, sortOrder }) => ({ id: entryId, sortOrder }));
}

export function nextSortOrder(items: readonly { sortOrder: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
}

// ---------------------------------------------------------------------------
// Errors from the database
// ---------------------------------------------------------------------------

export type CurriculumError =
  | "not_authorized"
  | "invalid_title"
  | "change_note_required"
  | "course_has_no_lessons"
  | "review_required"
  | "cannot_publish_own_submission"
  | "version_not_publishable"
  | "version_not_in_review"
  | "version_not_restorable"
  | "draft_exists"
  | "quiz_has_no_questions"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<CurriculumError>([
  "not_authorized",
  "invalid_title",
  "change_note_required",
  "course_has_no_lessons",
  "review_required",
  "cannot_publish_own_submission",
  "version_not_publishable",
  "version_not_in_review",
  "version_not_restorable",
  "draft_exists",
  "quiz_has_no_questions",
]);

export function toCurriculumError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): CurriculumError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as CurriculumError;
  }
  if (error?.code === "42501") {
    return "not_authorized";
  }
  return "unknown";
}

export function curriculumErrorMessage(error: CurriculumError): string {
  switch (error) {
    case "not_authorized":
      return "You can't change this course. Only drafts can be edited, by people who look after this department's training.";
    case "invalid_title":
      return "Give the course a title under 120 characters.";
    case "change_note_required":
      return "Say briefly what changed, so people can follow the history.";
    case "course_has_no_lessons":
      return "Add at least one lesson before publishing.";
    case "review_required":
      return "This department asks for a second person to publish. Submit it for review instead.";
    case "cannot_publish_own_submission":
      return "Someone else needs to publish what you submitted.";
    case "version_not_publishable":
      return "This version has already been published. Refresh to see the latest.";
    case "version_not_in_review":
      return "This version isn't waiting for review any more. Refresh to see the latest.";
    case "version_not_restorable":
      return "Only versions that were published can be restored.";
    case "draft_exists":
      return "There are unpublished changes already. Publish or finish them before restoring an older version.";
    case "quiz_has_no_questions":
      return "A quiz in this course has no questions yet. Add questions or remove the quiz first.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
