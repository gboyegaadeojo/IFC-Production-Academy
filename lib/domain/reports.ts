/**
 * Reports and exports (SRS-REPORT-001..007). Course completion, competency, and Approved to Serve
 * stay separate columns and separate reports (SPEC §3). Exports are CSV that opens in Excel.
 */

export type CourseReportState = "not_started" | "in_progress" | "awaiting_assessment" | "completed";

export const COURSE_REPORT_LABELS: Record<CourseReportState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_assessment: "Awaiting assessment",
  completed: "Completed",
};

export type ReadinessReportState =
  "not_assessed" | "approved" | "suspended" | "expired" | "approved_to_serve" | "not_approved";

export const READINESS_REPORT_LABELS: Record<ReadinessReportState, string> = {
  not_assessed: "Not assessed",
  approved: "Approved",
  suspended: "Suspended",
  expired: "Expired",
  approved_to_serve: "Approved to serve",
  not_approved: "Not approved",
};

export function isCourseReportState(value: string): value is CourseReportState {
  return Object.hasOwn(COURSE_REPORT_LABELS, value);
}

export function isReadinessReportState(value: string): value is ReadinessReportState {
  return Object.hasOwn(READINESS_REPORT_LABELS, value);
}

/**
 * One CSV cell. Quotes when needed, and stops spreadsheets running a value as a formula
 * (a cell starting with =, +, -, @, tab, or carriage return gets a leading apostrophe).
 */
export function csvCell(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** A CSV document with a byte-order mark, so Excel reads accents and names correctly. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (string | number | null)[][],
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `${BYTE_ORDER_MARK}${lines.join("\r\n")}\r\n`;
}

/** "camera-operations-training-2026-11-08.csv". */
export function csvFileName(departmentSlug: string, report: string, isoDate: string): string {
  const safe = (part: string) =>
    part
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${safe(departmentSlug)}-${safe(report)}-${isoDate.slice(0, 10)}.csv`;
}
