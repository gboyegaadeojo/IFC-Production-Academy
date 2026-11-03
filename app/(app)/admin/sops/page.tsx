import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSopDepartments, getSopsForStaff, sopTitle } from "@/lib/data/sops";
import { hasCapability } from "@/lib/domain/capabilities";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import { ALL_PRODUCTION_LABEL, ALL_PRODUCTION_VALUE, sopAudience } from "@/lib/domain/sops";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { SopLibrary, type SopLibraryRow } from "./sop-library";

export const metadata: Metadata = { title: "SOP library" };

export default function AdminSopsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading SOPs…" />}>
      <AdminSopsContent />
    </Suspense>
  );
}

/** SOP library for the people who look after it (SRS-SOP-001..004): every SOP and its state. */
async function AdminSopsContent() {
  const { grants, allowed } = await getAdminAccess("sops");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await getSopDepartments(grants);
  const all = await getSopsForStaff(departments.map((d) => d.id));

  const rows: SopLibraryRow[] = all.map((sop) => ({
    id: sop.id,
    title: sopTitle(sop),
    audience: sopAudience(sop.department),
    audienceValue: sop.department?.id ?? ALL_PRODUCTION_VALUE,
    hue: sop.department ? departmentHueVar(sop.department.hue) : null,
    category: sop.category,
    owner: sop.ownerName,
    versionNumber: sop.current?.versionNumber ?? null,
    reviewed: sop.lastReviewedAt ? formatDate(sop.lastReviewedAt) : null,
    state: sop.state,
    hasDraftChanges:
      sop.draft !== null && sop.state !== "not_published" && sop.state !== "archived",
  }));
  const addTo = [
    // Only organisation-wide rights reach SOPs with no department, here and in the database.
    ...(hasCapability(grants, "course.draft", null)
      ? [{ value: ALL_PRODUCTION_VALUE, label: ALL_PRODUCTION_LABEL }]
      : []),
    ...departments.filter((d) => d.canDraft).map((d) => ({ value: d.id, label: d.name })),
  ];

  return <SopLibrary rows={rows} addTo={addTo} audiences={departments} />;
}
