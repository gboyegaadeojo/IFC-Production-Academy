/**
 * Service types (decision record 9, stage 1): a service set up once ("Sunday service, 10:05, with
 * these positions"), then dated services made from it in one step. The Matrix lays several
 * services side by side, one row per position, as in Planning Center's Matrix.
 */
import { z } from "zod";
import { repeatingDates } from "./month-calendar";
import type { AssignmentStatus } from "./schedule";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const serviceTypeSchema = z.object({
  name: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Give the service a name.").max(80, "Keep it under 80 characters.")),
  startTime: z.string().regex(TIME, "Choose a start time."),
  durationMinutes: z.coerce
    .number()
    .int("Enter whole minutes.")
    .min(15, "At least 15 minutes.")
    .max(720, "At most 12 hours."),
  location: z.string().trim().max(120, "Keep the location under 120 characters."),
  notes: z.string().trim().max(1000, "Keep the notes under 1,000 characters."),
});

export type ServiceTypeInput = z.output<typeof serviceTypeSchema>;

export const createServicesSchema = z
  .object({
    firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first date."),
    count: z.coerce.number().int().min(1, "At least one.").max(52, "Up to 52 at a time."),
    everyWeeks: z.coerce.number().int().min(1).max(4),
  })
  .transform((value) => repeatingDates(value.firstDate, value.count, value.everyWeeks));

/** "10:05 a.m. · 1 h 45 min" */
export function serviceTimeLabel(startTime: string, durationMinutes: number): string {
  const [hour, minute] = startTime.split(":").map(Number) as [number, number];
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const length = [hours ? `${hours} h` : null, minutes ? `${minutes} min` : null]
    .filter(Boolean)
    .join(" ");
  return `${time} · ${length}`;
}

/** Positions as a list of role ids, with one added or one removed (by index). */
export function withPosition(roleIds: readonly string[], roleId: string): string[] {
  return [...roleIds, roleId];
}
export function withoutPosition(roleIds: readonly string[], index: number): string[] {
  return roleIds.filter((_, i) => i !== index);
}
export function movePosition(roleIds: readonly string[], index: number, delta: -1 | 1): string[] {
  const target = index + delta;
  if (target < 0 || target >= roleIds.length) {
    return [...roleIds];
  }
  const next = [...roleIds];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

export type MatrixPosition = {
  id: string;
  roleId: string;
  roleName: string;
  departmentName: string;
  sortOrder: number;
  person: { name: string; status: AssignmentStatus } | null;
};

export type MatrixService = { id: string; startsAt: string; positions: MatrixPosition[] };

export type MatrixRow = {
  key: string;
  label: string;
  departmentName: string;
  /** One cell per service, in the services' order; null where that service lacks the position. */
  cells: (MatrixPosition | null)[];
};

/**
 * One row per position across the services. A role needed twice in a service gets two rows
 * ("Camera 1", "Camera 1 (2)"). Rows follow the first service that has them.
 */
export function buildMatrix(services: readonly MatrixService[]): MatrixRow[] {
  const rows: MatrixRow[] = [];
  services.forEach((service, column) => {
    const seen = new Map<string, number>();
    for (const position of service.positions.toSorted((a, b) => a.sortOrder - b.sortOrder)) {
      const occurrence = (seen.get(position.roleId) ?? 0) + 1;
      seen.set(position.roleId, occurrence);
      const key = `${position.roleId}:${occurrence}`;
      let row = rows.find((r) => r.key === key);
      if (!row) {
        row = {
          key,
          label: occurrence === 1 ? position.roleName : `${position.roleName} (${occurrence})`,
          departmentName: position.departmentName,
          cells: services.map(() => null),
        };
        rows.push(row);
      }
      row.cells[column] = position;
    }
  });
  return rows;
}

export type ServiceTypeError =
  "not_authorized" | "duplicate_name" | "not_found" | "role_not_found" | "unknown";

const KNOWN: ReadonlySet<string> = new Set<ServiceTypeError>([
  "not_authorized",
  "duplicate_name",
  "not_found",
  "role_not_found",
]);

export function toServiceTypeError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): ServiceTypeError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as ServiceTypeError;
  }
  return error?.code === "42501" ? "not_authorized" : "unknown";
}

export function serviceTypeErrorMessage(error: ServiceTypeError): string {
  switch (error) {
    case "not_authorized":
      return "Only schedulers can do that, and only for departments they schedule.";
    case "duplicate_name":
      return "There's already a service with that name.";
    case "not_found":
      return "That service type isn't there any more.";
    case "role_not_found":
      return "One of those positions has been archived.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
