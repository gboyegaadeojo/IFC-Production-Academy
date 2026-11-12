import type { RequestDetail } from "@/lib/data/copyright";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { TIME_ZONE } from "@/lib/domain/time-zone";

const STATUS: Record<RequestDetail["status"], { label: string; tone: StatusTone }> = {
  new: { label: "New", tone: "info" },
  with_quality_control: { label: "With Quality control", tone: "pending" },
  with_copyright_review: { label: "With copyright review", tone: "pending" },
  approved: { label: "Approved", tone: "success" },
  declined: { label: "Not approved", tone: "neutral" },
};

const sentAt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function RequestStatusBadge({ status }: { status: RequestDetail["status"] }) {
  return <StatusBadge tone={STATUS[status].tone}>{STATUS[status].label}</StatusBadge>;
}

/**
 * One request, as Quality control and reviewers see it (ADD-COPY-04, -05): what it is, the link or
 * file, who asked and for when, and any question or decision so far.
 */
export function RequestSummary({
  request,
  fileHref,
}: {
  request: RequestDetail;
  /** Where the graphic opens, through a checked one-minute link. */
  fileHref: string | null;
}) {
  return (
    <section aria-label="The request" className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {request.mediaUrl ? (
          <a
            href={request.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch items-center rounded-button bg-accent px-4 font-semibold text-on-accent"
          >
            Open the {request.kind} in a new tab
          </a>
        ) : null}
        {request.hasFile && fileHref ? (
          <a
            href={fileHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch items-center rounded-button border border-border px-4 font-semibold"
          >
            Open the uploaded graphic
          </a>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-card border border-border bg-surface p-5 text-body sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-text-muted">From</dt>
        <dd>
          {request.requesterName} · {request.requesterEmail}
        </dd>
        <dt className="text-text-muted">For</dt>
        <dd>{request.serviceLabel}</dd>
        <dt className="text-text-muted">Sent</dt>
        <dd>
          {sentAt.format(new Date(request.createdAt))} ·{" "}
          {request.isLate ? (
            <strong>Late ({request.leadDays} days&apos; notice)</strong>
          ) : (
            `${request.leadDays} days' notice`
          )}
        </dd>
        <dt className="text-text-muted">About</dt>
        <dd className="whitespace-pre-line">{request.description}</dd>
        <dt className="text-text-muted">Status</dt>
        <dd>
          <RequestStatusBadge status={request.status} />
          {request.claimedBy ? (
            <span className="ml-2 text-small text-text-muted">
              Quality control: {request.claimedBy}
            </span>
          ) : null}
        </dd>
      </dl>
      {request.question ? (
        <div className="rounded-card bg-accent-soft p-4">
          <p className="text-small font-semibold">
            {request.sentForReviewBy ?? "Quality control"} asks
          </p>
          <p className="mt-1 whitespace-pre-line">{request.question}</p>
        </div>
      ) : null}
      {request.decidedAt ? (
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="font-semibold">
            {request.status === "approved" ? "Approved" : "Not approved"}
            {request.decidedBy ? ` by ${request.decidedBy}` : ""}
          </p>
          {request.decisionNote ? (
            <p className="mt-1 whitespace-pre-line text-text-secondary">{request.decisionNote}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
