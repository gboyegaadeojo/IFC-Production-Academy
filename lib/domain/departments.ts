/**
 * Department browsing and membership rules (SRS-MEM-001, SRS-MEM-006, ADD-PROG-01).
 * Pure functions: nothing here knows about a specific department.
 */

export type DepartmentStatus = "active" | "coming_soon" | "inactive";
export type EnrolmentMode = "request" | "invite_only";
export type MembershipStatus = "requested" | "active" | "declined" | "removed";

export type Department = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  status: DepartmentStatus;
  enrolmentMode: EnrolmentMode;
  hue: string;
  icon: string;
  sortOrder: number;
};

export type Membership = {
  id: string;
  departmentId: string;
  status: MembershipStatus;
  updatedAt: string;
};

export type DepartmentCardState =
  | { kind: "member" }
  | { kind: "requested" }
  | { kind: "can_request"; previously: "declined" | "removed" | null }
  | { kind: "coming_soon" }
  | { kind: "invite_only" }
  | { kind: "unavailable" };

const OPEN_STATUSES: ReadonlySet<MembershipStatus> = new Set(["requested", "active"]);

/**
 * One membership per department: an open one (requested or active) if it exists,
 * otherwise the most recently updated closed one.
 */
export function currentMembershipByDepartment(
  memberships: readonly Membership[],
): Map<string, Membership> {
  const byDepartment = new Map<string, Membership>();
  for (const membership of memberships) {
    const existing = byDepartment.get(membership.departmentId);
    if (!existing || isMoreCurrent(membership, existing)) {
      byDepartment.set(membership.departmentId, membership);
    }
  }
  return byDepartment;
}

function isMoreCurrent(candidate: Membership, existing: Membership): boolean {
  const candidateOpen = OPEN_STATUSES.has(candidate.status);
  const existingOpen = OPEN_STATUSES.has(existing.status);
  if (candidateOpen !== existingOpen) {
    return candidateOpen;
  }
  return Date.parse(candidate.updatedAt) > Date.parse(existing.updatedAt);
}

/** What a volunteer can do with a department card. Membership never implies approval to serve. */
export function departmentCardState(
  department: Pick<Department, "status" | "enrolmentMode">,
  membership: Pick<Membership, "status"> | null | undefined,
): DepartmentCardState {
  if (department.status === "inactive") {
    return { kind: "unavailable" };
  }
  if (membership?.status === "active") {
    return { kind: "member" };
  }
  if (department.status === "coming_soon") {
    return { kind: "coming_soon" };
  }
  if (membership?.status === "requested") {
    return { kind: "requested" };
  }
  if (department.enrolmentMode === "invite_only") {
    return { kind: "invite_only" };
  }
  return { kind: "can_request", previously: membership?.status ?? null };
}

/** Departments a volunteer may browse, in their configured order. */
export function browsableDepartments<T extends Pick<Department, "status" | "sortOrder" | "name">>(
  departments: readonly T[],
): T[] {
  return departments
    .filter((department) => department.status !== "inactive")
    .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Department hues are design tokens (SPEC §7). Unknown hues fall back to the accent text colour. */
export const DEPARTMENT_HUES = [
  { key: "blue", label: "Blue" },
  { key: "teal", label: "Teal" },
  { key: "violet", label: "Violet" },
  { key: "coral", label: "Coral" },
  { key: "amber", label: "Amber" },
  { key: "pink", label: "Pink" },
  { key: "cyan", label: "Cyan" },
  { key: "lime", label: "Lime" },
] as const;
const KNOWN_HUES: ReadonlySet<string> = new Set(DEPARTMENT_HUES.map((h) => h.key));

export function departmentHueVar(hue: string): string {
  return KNOWN_HUES.has(hue) ? `var(--dept-${hue})` : "var(--accent-light)";
}

export type RequestMembershipError =
  | "not_signed_in"
  | "not_authorized"
  | "department_not_found"
  | "department_not_open"
  | "department_invite_only"
  | "unknown";

const KNOWN_REQUEST_ERRORS: ReadonlySet<string> = new Set([
  "not_authorized",
  "department_not_found",
  "department_not_open",
  "department_invite_only",
]);

/** Maps a database error message from request_membership() to a known error. */
export function toRequestMembershipError(
  message: string | null | undefined,
): RequestMembershipError {
  if (message && KNOWN_REQUEST_ERRORS.has(message)) {
    return message as RequestMembershipError;
  }
  return "unknown";
}

export function requestMembershipErrorMessage(error: RequestMembershipError): string {
  switch (error) {
    case "not_signed_in":
      return "Your session has ended. Sign in again to send your request.";
    case "not_authorized":
      return "Your account can't send requests right now. Talk to your department leader.";
    case "department_not_found":
      return "We couldn't find that department. Refresh the page and try again.";
    case "department_not_open":
      return "This department isn't taking requests yet.";
    case "department_invite_only":
      return "This department is by invitation. Ask the department leader for an invite.";
    case "unknown":
      return "Your request didn't go through. Check your connection and try again.";
  }
}

/**
 * A web address part from a department name: "Camera Operations" -> "camera-operations". Taken
 * names get a number: "camera-operations-2".
 */
export function departmentSlug(name: string, taken: ReadonlySet<string> = new Set()): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "department";
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) {
    slug = `${base}-${n}`;
  }
  return slug;
}
