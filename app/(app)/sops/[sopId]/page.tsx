import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon, InfoIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getSop, sopTitle } from "@/lib/data/sops";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  formatFileSize,
  reviewDueAt,
  SOP_STATE_LABELS,
  SOP_VERSION_LABELS,
} from "@/lib/domain/sops";

export const metadata: Metadata = { title: "SOP" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/sops/[sopId]">;

export default function SopPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<SopSkeleton />}>
      <SopContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function fileKind(type: string | null): string {
  return type === "application/pdf" ? "PDF" : type?.startsWith("image/") ? "image" : "file";
}

/**
 * One SOP (SPEC §3 workflow E, §7): whether it's Current, Review due, or Archived is the first
 * thing shown, and older versions are marked Superseded so nobody follows an obsolete procedure.
 */
async function SopContent({ params, searchParams }: Props) {
  await requireActiveUser();
  const { sopId } = await params;
  if (!UUID.test(sopId)) {
    notFound();
  }
  const sop = await getSop(sopId);
  if (!sop || (sop.current === null && sop.draft === null)) {
    notFound();
  }
  const query = await searchParams;
  const unavailable = query.file === "unavailable";
  const title = sopTitle(sop);
  const due = reviewDueAt(sop.lastReviewedAt, sop.reviewIntervalMonths);
  const style = { "--dept": departmentHueVar(sop.department.hue) } as CSSProperties;
  const history = sop.versions.filter((v) => v.status !== "draft");

  return (
    <div style={style} className="page-container flex flex-col gap-8 py-8 lg:py-12">
      <Breadcrumbs items={[{ label: "SOP library", href: "/sops" }, { label: title }]} />
      <div className="flex reading-width flex-col gap-8">
        <header className="flex flex-col gap-3 border-l-2 border-[var(--dept)] pl-5">
          <p className="eyebrow">
            {sop.department.name}
            {sop.category ? ` · ${sop.category}` : ""}
          </p>
          <h1 className="text-title font-semibold text-balance">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={sop.state === "current" ? "success" : "pending"}>
              {SOP_STATE_LABELS[sop.state]}
            </StatusBadge>
            {sop.current?.versionNumber ? (
              <span className="text-small text-text-muted">
                Version {sop.current.versionNumber}
              </span>
            ) : null}
          </div>
          {sop.current?.summary ? (
            <p className="text-lead text-text-secondary">{sop.current.summary}</p>
          ) : null}
        </header>

        {sop.state === "archived" ? (
          <p className="flex gap-2 rounded-card border border-border p-4 text-text-secondary">
            <InfoIcon className="mt-0.5 size-5 shrink-0" />
            This SOP was archived and is no longer in use. It&apos;s kept for the record.
          </p>
        ) : sop.state === "review_due" ? (
          <p className="flex gap-2 rounded-card border border-border p-4 text-text-secondary">
            <InfoIcon className="mt-0.5 size-5 shrink-0" />
            This SOP was due for review{due ? ` on ${formatDate(due.toISOString())}` : ""}.
            It&apos;s still the current version; check with{" "}
            {sop.ownerName ?? "the department leader"} if anything looks out of date.
          </p>
        ) : null}

        {sop.current && sop.state !== "archived" ? (
          <section
            aria-labelledby="sop-file-heading"
            className="flex flex-col gap-3 rounded-card border border-border bg-card p-5"
          >
            <h2 id="sop-file-heading" className="font-medium">
              The procedure
            </h2>
            <p className="text-small text-text-secondary">
              {sop.current.fileName}
              {sop.current.fileSize ? ` · ${formatFileSize(sop.current.fileSize)}` : ""}
            </p>
            <a
              href={`/sops/${sop.id}/file`}
              target="_blank"
              rel="noopener"
              className={buttonClasses("primary", "w-fit")}
            >
              Open the {fileKind(sop.current.fileType)}
              <span className="sr-only"> (opens in a new tab)</span>
              <ArrowRightIcon className="size-4" />
            </a>
            {unavailable ? (
              <p role="alert" className="text-small text-error">
                That file couldn&apos;t be opened. Try again, or ask the department leader.
              </p>
            ) : null}
          </section>
        ) : null}

        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
          <dt className="text-small text-text-muted">Owner</dt>
          <dd>{sop.ownerName ?? "Not recorded"}</dd>
          <dt className="text-small text-text-muted">Last reviewed</dt>
          <dd>{sop.lastReviewedAt ? formatDate(sop.lastReviewedAt) : "Not yet"}</dd>
          <dt className="text-small text-text-muted">Next review</dt>
          <dd>{due ? formatDate(due.toISOString()) : "After it's published"}</dd>
        </dl>

        {history.length > 0 ? (
          <section aria-labelledby="sop-history-heading" className="flex flex-col gap-3">
            <h2 id="sop-history-heading" className="text-heading font-semibold">
              Version history
            </h2>
            <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
              {history.map((version) => (
                <li key={version.id} className="flex flex-col gap-1 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      Version {version.versionNumber}: {version.title}
                    </span>
                    <StatusBadge tone={version.status === "published" ? "success" : "neutral"}>
                      {SOP_VERSION_LABELS[version.status]}
                    </StatusBadge>
                  </div>
                  {version.changeNote ? (
                    <p className="text-small whitespace-pre-line text-text-secondary">
                      {version.changeNote}
                    </p>
                  ) : null}
                  {version.publishedAt ? (
                    <p className="text-small text-text-muted">
                      Published {formatDate(version.publishedAt)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="text-small text-text-muted">
              Only the current version can be opened, so nobody follows an old procedure by mistake.
            </p>
          </section>
        ) : null}

        <Link
          href="/sops"
          className="w-fit text-small text-accent-light underline-offset-4 hover:underline"
        >
          Back to the SOP library
        </Link>
      </div>
    </div>
  );
}

function SopSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the SOP…" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <Skeleton className="h-32 max-w-2xl" />
    </div>
  );
}
