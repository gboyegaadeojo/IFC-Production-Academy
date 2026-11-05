import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import Loading from "./loading";
import { requireActiveUser } from "@/lib/data/auth";
import { getSopLibrary, sopTitle } from "@/lib/data/sops";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import { ALL_PRODUCTION_VALUE, sopAudience } from "@/lib/domain/sops";
import { SopBrowser, type SopBrowserRow } from "../sop-browser";

export const metadata: Metadata = { title: "SOP library" };

export default function SopLibraryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LibraryContent />
    </Suspense>
  );
}

/**
 * SOP library (SPEC §7 "SOP library", SRS-SOP-001): search, department and category filters, and
 * when each SOP was last reviewed. Each SOP's own page shows its owner and summary.
 */
async function LibraryContent() {
  await requireActiveUser();
  const all = await getSopLibrary();
  const rows: SopBrowserRow[] = all.map((sop) => ({
    id: sop.id,
    title: sopTitle(sop),
    summary: sop.current?.summary ?? "",
    audience: sopAudience(sop.department),
    audienceValue: sop.department?.id ?? ALL_PRODUCTION_VALUE,
    hue: sop.department ? departmentHueVar(sop.department.hue) : null,
    category: sop.category,
    reviewed: sop.lastReviewedAt ? formatDate(sop.lastReviewedAt) : null,
    publishedAt: sop.current?.publishedAt ?? null,
    state: sop.state,
  }));
  const departments = [
    ...new Map(
      all.flatMap((sop) => (sop.department ? [[sop.department.id, sop.department.name]] : [])) as [
        string,
        string,
      ][],
    ),
  ].map(([id, name]) => ({ id, name }));

  return (
    <div className="page-container flex flex-col gap-4 py-6 lg:py-8">
      <PageHeader
        title="SOP library"
        description="Your team's written procedures. Search for what you need, or browse by category."
      />
      {rows.length === 0 ? (
        <EmptyState title="No SOPs here yet">
          SOPs appear here once they&apos;re published.
        </EmptyState>
      ) : (
        <SopBrowser rows={rows} departments={departments} />
      )}
    </div>
  );
}
