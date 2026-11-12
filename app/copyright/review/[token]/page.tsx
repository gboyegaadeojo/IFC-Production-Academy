import type { Metadata } from "next";
import { DecisionForm } from "@/components/copyright/decision-form";
import { RequestSummary } from "@/components/copyright/request-summary";
import { getOutsideReview } from "@/lib/data/copyright";
import { outsideReviewAction } from "../../actions";
import { LinkStopped } from "../../link-stopped";

export const metadata: Metadata = { title: "Copyright review" };

/**
 * An outside copyright reviewer decides from the private link to one request (ADD-COPY-05, -06).
 * No sign-in. The link stops working once it's decided, or after 14 days.
 */
export default async function OutsideReviewPage({
  params,
}: PageProps<"/copyright/review/[token]">) {
  const { token } = await params;
  const request = await getOutsideReview(token);
  if (!request) {
    return <LinkStopped />;
  }
  const fileHref = request.hasFile
    ? `/copyright/file?via=review&t=${encodeURIComponent(token)}`
    : null;
  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          {request.reference} · copyright review · {request.me} · no sign-in needed
        </p>
        <h1 className="text-title font-semibold">{request.description}</h1>
      </header>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <RequestSummary request={request} fileHref={fileHref} />
        <div className="flex flex-col gap-3">
          <DecisionForm
            action={outsideReviewAction.bind(null, token)}
            mode="reviewer"
            requesterFirstName={request.requesterName.split(" ")[0] ?? request.requesterName}
            checks={request.checks}
          />
          <p className="text-small text-text-muted">
            Your decision goes straight to {request.requesterName}, and Quality control gets a copy.
            Need to ask something first? Reply to the email.
          </p>
        </div>
      </div>
    </>
  );
}
