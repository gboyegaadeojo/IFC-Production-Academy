import "server-only";
import { requireActiveUser, type CurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { canOpenAdminSection, type AdminSectionKey } from "@/lib/domain/admin";
import type { CapabilityGrant } from "@/lib/domain/capabilities";

export type AdminAccess = { user: CurrentUser; grants: CapabilityGrant[]; allowed: boolean };

/** For admin pages and actions: signed in, active, and holding the section's capability. */
export async function getAdminAccess(section: AdminSectionKey): Promise<AdminAccess> {
  const user = await requireActiveUser();
  const grants = await getMyCapabilities();
  return { user, grants, allowed: canOpenAdminSection(grants, section) };
}
