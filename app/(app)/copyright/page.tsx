import type { Metadata } from "next";
import { RequestList } from "@/components/copyright/request-list";
import { PageHeader } from "@/components/ui/page-header";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getMyReviews } from "@/lib/data/copyright";

export const metadata: Metadata = { title: "Copyright" };

/**
 * Copyright, for Academy members with the Copyright reviewer permission (ADD-COPY-05): the video
 * and graphics requests Quality control has sent them, and what they decided in the last 30 days.
 */
export default async function CopyrightPage() {
  const grants = await getMyCapabilities();
  if (!grants.some((grant) => grant.capability === "copyright.review")) {
    return (
      <div className="page-container flex flex-col gap-4 py-8">
        <PageHeader title="Copyright" />
        <p className="text-text-secondary">
          This is for copyright reviewers. An admin gives the Copyright reviewer role in Admin →
          People.
        </p>
      </div>
    );
  }
  const requests = await getMyReviews().catch(() => null);
  if (!requests) {
    return (
      <div className="page-container flex flex-col gap-4 py-8">
        <PageHeader title="Copyright" />
        <p className="text-text-secondary">Video and graphics approvals are switched off.</p>
      </div>
    );
  }
  const waiting = requests.filter((r) => r.status === "with_copyright_review");
  const decided = requests.filter((r) => r.status !== "with_copyright_review");
  return (
    <div className="page-container flex flex-col gap-6 py-8">
      <PageHeader
        title="Copyright"
        description="Video and graphics requests Quality control has sent you for a copyright review. Your decision goes straight to the person who asked."
      />
      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="text-heading font-semibold">
          Waiting for you · {waiting.length}
        </h2>
        <RequestList
          requests={waiting}
          hrefFor={(id) => `/copyright/requests/${id}`}
          empty="Nothing waiting. Quality control will email you when they send one."
        />
      </section>
      {decided.length > 0 ? (
        <section aria-labelledby="decided-heading" className="flex flex-col gap-3">
          <h2 id="decided-heading" className="text-heading font-semibold">
            Decided in the last 30 days
          </h2>
          <RequestList requests={decided} hrefFor={(id) => `/copyright/requests/${id}`} empty="" />
        </section>
      ) : null}
    </div>
  );
}
