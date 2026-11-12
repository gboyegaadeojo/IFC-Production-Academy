import Link from "next/link";
import type { RequestRow } from "@/lib/data/copyright";
import { RequestStatusBadge } from "./request-summary";

/** Requests in a list, soonest service first, decided ones after (ADD-COPY-04, -05). */
export function RequestList({
  requests,
  hrefFor,
  empty,
}: {
  requests: RequestRow[];
  hrefFor: (id: string) => string;
  empty: string;
}) {
  if (requests.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface p-5 text-text-secondary">
        {empty}
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {requests.map((request) => (
        <li key={request.id}>
          <Link
            href={hrefFor(request.id)}
            className="flex flex-col gap-2 p-4 transition-surface hover:bg-hover sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{request.description}</span>
              <span className="text-small text-text-secondary">
                {request.kind === "video" ? "Video" : "Graphic"} · {request.serviceLabel} · from{" "}
                {request.requesterName} · {request.reference}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              {request.isLate ? (
                <span className="rounded-pill border border-warning-line bg-warning-soft px-2 text-small font-semibold">
                  Late
                </span>
              ) : null}
              <RequestStatusBadge status={request.status} />
              {request.status === "with_copyright_review" && request.reviewers.length > 0 ? (
                <span className="text-small text-text-muted">{request.reviewers.join(", ")}</span>
              ) : request.claimedBy && request.status === "with_quality_control" ? (
                <span className="text-small text-text-muted">{request.claimedBy}</span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
