/**
 * SOP library rules (SRS-SOP-001..006, SPEC §3 workflow E). Pure functions shared by the library,
 * the editor, and the tests. The database decides every change.
 */
import { z } from "zod";

export type SopVersionStatus = "draft" | "published" | "superseded";

export const MAX_SOP_FILE_BYTES = 10 * 1024 * 1024;

export type SopFileType = "application/pdf" | "image/png" | "image/jpeg";

const EXTENSIONS: Record<SopFileType, "pdf" | "png" | "jpg"> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export function sopFileExtension(type: SopFileType): "pdf" | "png" | "jpg" {
  return EXTENSIONS[type];
}

/**
 * The file's real type from its first bytes, not from its name or what the browser claims. Null for
 * anything that isn't a PDF, PNG, or JPEG.
 */
export function sniffSopFileType(bytes: Uint8Array): SopFileType | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    return "application/pdf"; // %PDF-
  }
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }
  if (starts(0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }
  return null;
}

/** A display name for an uploaded file: no folders, no control characters, at most 200 long. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned === "" ? "file" : cleaned;
}

export type SopFileProblem = "missing" | "too_large" | "wrong_type";

/** Checks an upload before it's stored. */
export function checkSopFile(
  file: { size: number; name: string },
  firstBytes: Uint8Array,
): { ok: true; type: SopFileType; name: string } | { ok: false; problem: SopFileProblem } {
  if (file.size === 0) {
    return { ok: false, problem: "missing" };
  }
  if (file.size > MAX_SOP_FILE_BYTES) {
    return { ok: false, problem: "too_large" };
  }
  const type = sniffSopFileType(firstBytes);
  return type
    ? { ok: true, type, name: cleanFileName(file.name) }
    : { ok: false, problem: "wrong_type" };
}

export const SOP_FILE_PROBLEMS: Record<SopFileProblem, string> = {
  missing: "Choose a file to upload.",
  too_large: "That file is over 10 MB. Save a smaller PDF and try again.",
  wrong_type: "Upload a PDF, PNG, or JPEG file.",
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Review status (SRS-SOP-003)
// ---------------------------------------------------------------------------

/** When the review is due: the last review plus the interval, or null if never published. */
export function reviewDueAt(lastReviewedAt: string | null, intervalMonths: number): Date | null {
  if (lastReviewedAt === null) {
    return null;
  }
  const due = new Date(lastReviewedAt);
  const day = due.getUTCDate();
  due.setUTCDate(1);
  due.setUTCMonth(due.getUTCMonth() + intervalMonths);
  const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
  due.setUTCDate(Math.min(day, lastDay));
  return due;
}

export type SopState = "current" | "review_due" | "not_published" | "archived";

/** What the library shows for an SOP. "Changes in progress" is shown separately, to staff. */
export function sopState(
  sop: { archivedAt: string | null; lastReviewedAt: string | null; reviewIntervalMonths: number },
  hasPublished: boolean,
  now: Date,
): SopState {
  if (sop.archivedAt !== null) {
    return "archived";
  }
  if (!hasPublished) {
    return "not_published";
  }
  const due = reviewDueAt(sop.lastReviewedAt, sop.reviewIntervalMonths);
  return due !== null && due.getTime() <= now.getTime() ? "review_due" : "current";
}

export const SOP_STATE_LABELS: Record<SopState, string> = {
  current: "Current",
  review_due: "Review due",
  not_published: "Not published yet",
  archived: "Archived",
};

export const SOP_VERSION_LABELS: Record<SopVersionStatus, string> = {
  draft: "Draft",
  published: "Current",
  superseded: "Superseded",
};

export const REVIEW_INTERVALS = [3, 6, 12, 24] as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const titleField = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."));

export const sopTitleSchema = titleField;

export const sopDetailsSchema = z.object({
  title: titleField,
  summary: z.string().trim().max(1000, "Keep the summary under 1,000 characters."),
});

export const sopSettingsSchema = z.object({
  category: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(60, "Keep the category under 60 characters.")),
  reviewIntervalMonths: z.coerce
    .number()
    .int()
    .refine((value) => (REVIEW_INTERVALS as readonly number[]).includes(value), {
      message: "Choose how often it's reviewed.",
    }),
});

/** Case-insensitive match on title, summary, or category, for the library search. */
export function matchesSearch(
  sop: { title: string; summary: string; category: string },
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const text = `${sop.title} ${sop.summary} ${sop.category}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

// ---------------------------------------------------------------------------
// Errors from the database
// ---------------------------------------------------------------------------

export type SopError =
  | "not_authorized"
  | "invalid_title"
  | "sop_has_no_file"
  | "sop_not_published"
  | "change_note_required"
  | "version_not_publishable"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<SopError>([
  "not_authorized",
  "invalid_title",
  "sop_has_no_file",
  "sop_not_published",
  "change_note_required",
  "version_not_publishable",
]);

export function toSopError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): SopError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as SopError;
  }
  if (error?.code === "42501") {
    return "not_authorized";
  }
  return "unknown";
}

export function sopErrorMessage(error: SopError): string {
  switch (error) {
    case "not_authorized":
      return "You can't change this SOP. Only drafts can be edited, by people who look after this department's training.";
    case "invalid_title":
      return "Give the SOP a title under 120 characters.";
    case "sop_has_no_file":
      return "Upload the SOP's file before publishing.";
    case "sop_not_published":
      return "Publish the SOP before marking it reviewed.";
    case "change_note_required":
      return "Say briefly what changed, so people can follow the history.";
    case "version_not_publishable":
      return "This version has already been published. Refresh to see the latest.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
