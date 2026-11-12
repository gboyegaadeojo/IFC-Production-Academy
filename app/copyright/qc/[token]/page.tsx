import type { Metadata } from "next";
import { RequestList } from "@/components/copyright/request-list";
import { getQualityControlRequests } from "@/lib/data/copyright";
import { LinkStopped } from "../../link-stopped";

export const metadata: Metadata = { title: "Video and graphics requests" };

/**
 * Quality control's open and recent requests, from the private link in their email (ADD-COPY-04).
 * No sign-in; the link works for 30 days while they're on the Quality control list.
 */
export default async function QualityControlPage({ params }: PageProps<"/copyright/qc/[token]">) {
  const { token } = await params;
  const data = await getQualityControlRequests(token);
  if (!data) {
    return <LinkStopped />;
  }
  const open = data.requests.filter((r) => r.status !== "approved" && r.status !== "declined");
  const decided = data.requests.filter((r) => r.status === "approved" || r.status === "declined");
  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Quality control · {data.me} · no sign-in needed</p>
        <h1 className="text-display font-semibold">Video and graphics requests</h1>
        <p className="text-text-secondary">
          Every request comes here first. Approve or decline it, or send it for a copyright review.
          Soonest service first.
        </p>
      </header>
      <section aria-labelledby="open-heading" className="flex flex-col gap-3">
        <h2 id="open-heading" className="text-heading font-semibold">
          Open · {open.length}
        </h2>
        <RequestList
          requests={open}
          hrefFor={(id) => `/copyright/qc/${token}/${id}`}
          empty="Nothing waiting. New requests will be emailed to you."
        />
      </section>
      {decided.length > 0 ? (
        <section aria-labelledby="decided-heading" className="flex flex-col gap-3">
          <h2 id="decided-heading" className="text-heading font-semibold">
            Decided in the last 30 days
          </h2>
          <RequestList
            requests={decided}
            hrefFor={(id) => `/copyright/qc/${token}/${id}`}
            empty=""
          />
        </section>
      ) : null}
      <p className="text-small text-text-muted">
        This page is just for you. Opening a request puts your name on it, so two people don&apos;t
        check the same one.
      </p>
    </>
  );
}
