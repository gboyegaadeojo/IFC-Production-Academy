import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { memberReviewAction } from "@/app/copyright/actions";
import { DecisionForm } from "@/components/copyright/decision-form";
import { RequestSummary } from "@/components/copyright/request-summary";
import { PageHeader } from "@/components/ui/page-header";
import { openMyReview } from "@/lib/data/copyright";

export const metadata: Metadata = { title: "Copyright review" };

const UUID = /^[0-9a-f-]{36}$/;

/** An Academy reviewer decides on a request sent to them (ADD-COPY-05, -06). */
export default async function CopyrightRequestPage({
  params,
}: PageProps<"/copyright/requests/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) {
    notFound();
  }
  const request = await openMyReview(id);
  if (!request) {
    notFound();
  }
  const fileHref = request.hasFile ? `/copyright/file?via=member&r=${request.id}` : null;
  return (
    <div className="page-container flex flex-col gap-6 py-8">
      <PageHeader
        title={request.description}
        eyebrow={`${request.reference} · copyright review`}
        breadcrumbs={[{ label: "Copyright", href: "/copyright" }, { label: request.reference }]}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <RequestSummary request={request} fileHref={fileHref} />
        {request.status === "with_copyright_review" ? (
          <div className="flex flex-col gap-3">
            <DecisionForm
              action={memberReviewAction.bind(null, request.id)}
              mode="reviewer"
              requesterFirstName={request.requesterName.split(" ")[0] ?? request.requesterName}
              checks={request.checks}
            />
            <p className="text-small text-text-muted">
              Your decision goes straight to {request.requesterName}, and Quality control gets a
              copy.
            </p>
          </div>
        ) : (
          <p className="rounded-card border border-border bg-surface p-5 text-text-secondary">
            This request has been decided.
          </p>
        )}
      </div>
    </div>
  );
}
