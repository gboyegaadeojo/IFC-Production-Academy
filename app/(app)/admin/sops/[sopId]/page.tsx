import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSop, getSopDepartments, getSopsForStaff, sopTitle } from "@/lib/data/sops";
import { hasCapability } from "@/lib/domain/capabilities";
import { formatDate } from "@/lib/domain/dates";
import {
  formatFileSize,
  NO_CATEGORY_LABEL,
  reviewDueAt,
  sopAudience,
  sopCategories,
} from "@/lib/domain/sops";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { SopEditor } from "./sop-editor";

export const metadata: Metadata = { title: "SOP" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/sops/[sopId]">;

export default function AdminSopPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the SOP…" />}>
      <AdminSopContent params={params} />
    </Suspense>
  );
}

/**
 * Maintain an SOP (SPEC §3 workflow E): write a draft, attach a file, publish it as the current
 * version, confirm reviews, and archive. Published versions never change (SRS-SOP-002).
 */
async function AdminSopContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("sops");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { sopId } = await params;
  if (!UUID.test(sopId)) {
    notFound();
  }
  const sop = await getSop(sopId);
  if (!sop) {
    notFound();
  }
  const departmentId = sop.department?.id ?? null;
  const canDraft = hasCapability(grants, "course.draft", departmentId);
  const canPublish = hasCapability(grants, "course.publish", departmentId);
  const archived = sop.archivedAt !== null;
  const draft = !archived && canDraft ? sop.draft : null;
  const shown = draft ?? sop.current ?? sop.versions[0] ?? null;
  const due = reviewDueAt(sop.lastReviewedAt, sop.reviewIntervalMonths);
  const others = await getSopsForStaff((await getSopDepartments(grants)).map((d) => d.id));

  return (
    <SopEditor
      // A new draft or a new version starts the editor afresh.
      key={shown?.id ?? sop.id}
      sopId={sop.id}
      audience={sopAudience(sop.department)}
      ownerName={sop.ownerName}
      archived={archived}
      draftId={draft?.id ?? null}
      currentVersion={sop.current?.versionNumber ?? null}
      title={sopTitle(sop)}
      summary={shown?.summary ?? ""}
      body={shown?.body ?? ""}
      category={sop.category}
      reviewIntervalMonths={sop.reviewIntervalMonths}
      categories={sopCategories(others).filter((name) => name !== NO_CATEGORY_LABEL)}
      reviewed={sop.lastReviewedAt ? formatDate(sop.lastReviewedAt) : null}
      nextReview={due ? formatDate(due.toISOString()) : null}
      reviewDue={sop.state === "review_due"}
      file={
        shown?.fileName
          ? {
              label: shown.fileSize
                ? `${shown.fileName} · ${formatFileSize(shown.fileSize)}`
                : shown.fileName,
              href: `/sops/${sop.id}/file?version=${shown.id}`,
            }
          : null
      }
      canDraft={canDraft}
      canPublish={canPublish}
      canReview={canPublish && !archived && sop.current !== null}
      canArchive={canPublish && !archived}
      history={sop.versions
        .filter((version) => version.status !== "draft")
        .map((version) => ({
          id: version.id,
          number: version.versionNumber,
          note: version.changeNote,
          publishedAt: version.publishedAt ? formatDate(version.publishedAt) : null,
          current: version.status === "published",
          fileName: version.fileName,
          fileHref: version.fileName ? `/sops/${sop.id}/file?version=${version.id}` : null,
        }))}
    />
  );
}
