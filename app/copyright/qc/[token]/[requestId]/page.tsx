import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionForm } from "@/components/copyright/decision-form";
import { RequestSummary } from "@/components/copyright/request-summary";
import { openQualityControlRequest } from "@/lib/data/copyright";
import { qualityControlAction } from "../../../actions";
import { LinkStopped } from "../../../link-stopped";

export const metadata: Metadata = { title: "Check a request" };

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Quality control checks one request (ADD-COPY-04, -05, -07): approve, decline, or send it for a
 * copyright review, and place it in the order of service. Opening a new one claims it.
 */
export default async function QualityControlRequestPage({
  params,
}: PageProps<"/copyright/qc/[token]/[requestId]">) {
  const { token, requestId } = await params;
  if (!UUID.test(requestId)) {
    notFound();
  }
  const request = await openQualityControlRequest(token, requestId);
  if (!request) {
    return <LinkStopped />;
  }
  const open = request.status === "new" || request.status === "with_quality_control";
  const fileHref = request.hasFile
    ? `/copyright/file?via=quality_control&t=${encodeURIComponent(token)}&r=${request.id}`
    : null;
  return (
    <>
      <Link href={`/copyright/qc/${token}`} className="self-start font-semibold underline">
        All requests
      </Link>
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          {request.reference} · Quality control · {request.me}
        </p>
        <h1 className="text-title font-semibold">{request.description}</h1>
      </header>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <RequestSummary request={request} fileHref={fileHref} />
        {open ? (
          <DecisionForm
            action={qualityControlAction.bind(null, token, request.id)}
            mode="quality_control"
            requesterFirstName={request.requesterName.split(" ")[0] ?? request.requesterName}
            checks={request.checks}
            reviewers={request.reviewers}
          />
        ) : (
          <p className="rounded-card border border-border bg-surface p-5 text-text-secondary">
            {request.status === "with_copyright_review"
              ? "It's with the copyright review. The requester hears straight from the reviewer, and you'll get a copy."
              : "This request has been decided."}
          </p>
        )}
      </div>
    </>
  );
}
