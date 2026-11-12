import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";
import { getRequestStatus } from "@/lib/data/copyright";
import { requesterSteps, type RequesterStep } from "@/lib/domain/copyright";
import { TIME_ZONE } from "@/lib/domain/time-zone";

export const metadata: Metadata = {
  title: "Your request",
  // A private link: never indexed, and never sent on to another site.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const when = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const STEP_TEXT: Record<RequesterStep, { title: string; detail: string }> = {
  sent: { title: "Sent", detail: "" },
  quality_control: {
    title: "With Quality control",
    detail: "They'll decide, or ask for a copyright review if it needs one.",
  },
  copyright_review: {
    title: "Copyright review, if needed",
    detail: "Only some requests need this step.",
  },
  decision: { title: "Decision", detail: "We'll email you the answer, and it shows here too." },
};

/** The requester's progress, from the private link in their email (ADD-COPY-03). */
export default async function RequestStatusPage({
  params,
}: PageProps<"/media-request/status/[token]">) {
  const { token } = await params;
  const request = await getRequestStatus(token);

  return (
    <main id="main" className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <Wordmark />
        {request ? (
          <section className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6">
            <div className="flex flex-col gap-1">
              <p className="text-small text-text-muted">Reference {request.reference}</p>
              <h1 className="text-title font-semibold">
                Your {request.kind} for {request.serviceLabel}
              </h1>
              <p className="text-text-secondary">{request.description}</p>
            </div>
            <ol className="flex flex-col gap-4">
              {requesterSteps(request.status, request.hadCopyrightReview).map(({ step, state }) => {
                const text = STEP_TEXT[step];
                const detail =
                  step === "sent"
                    ? when.format(new Date(request.createdAt))
                    : step === "decision" && state === "done"
                      ? `${request.status === "approved" ? "Approved" : "Not approved"}${
                          request.decidedAt ? `, ${when.format(new Date(request.decidedAt))}` : ""
                        }`
                      : text.detail;
                return (
                  <li
                    key={step}
                    aria-current={state === "current" ? "step" : undefined}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex size-7 items-center justify-center rounded-pill text-small font-semibold ${
                        state === "done"
                          ? "bg-success text-on-accent"
                          : state === "current"
                            ? "border-[3px] border-accent bg-accent-soft"
                            : state === "optional"
                              ? "border-2 border-dashed border-border-strong"
                              : "border-2 border-border"
                      }`}
                    >
                      {state === "done" ? "✓" : ""}
                    </span>
                    <span className="flex flex-col">
                      <span
                        className={`font-semibold ${state === "upcoming" || state === "optional" ? "text-text-muted" : ""}`}
                      >
                        {text.title}
                        <span className="sr-only">
                          {state === "done"
                            ? " (done)"
                            : state === "current"
                              ? " (now)"
                              : state === "optional"
                                ? " (if needed)"
                                : " (still to come)"}
                        </span>
                      </span>
                      {detail ? (
                        <span className="text-small text-text-secondary">{detail}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            {request.decisionNote ? (
              <div className="rounded-button bg-hover p-4 text-small">
                <p className="font-semibold">A note from the team</p>
                <p className="mt-1 whitespace-pre-line text-text-secondary">
                  {request.decisionNote}
                </p>
              </div>
            ) : null}
            {request.status === "declined" ? (
              <Link href="/media-request" className={buttonClasses("primary", "self-start")}>
                Send a new version
              </Link>
            ) : null}
            <p className="text-small text-text-muted">
              Only people with your email&apos;s link can see this page.
            </p>
          </section>
        ) : (
          <section role="status" className="rounded-card border border-border bg-surface p-6">
            <h1 className="text-title font-semibold">This link doesn&apos;t open a request</h1>
            <p className="mt-2 text-text-secondary">
              Check you used the whole link from your email, or send a new request.
            </p>
            <Link href="/media-request" className={buttonClasses("secondary", "mt-4")}>
              Send a request
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
