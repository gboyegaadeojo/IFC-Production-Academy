import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { getOpenDepartments } from "@/lib/data/onboarding";
import { InterestForm } from "./interest-form";

export const metadata: Metadata = {
  title: "Serve behind the scenes",
  description: "Join the production team at Immanuel Fellowship Church.",
};

const NEXT = [
  { title: "A leader says hello", detail: "Within a few days, to find a time for a short chat." },
  { title: "A short course", detail: "What serving on the team looks like, at your own pace." },
  {
    title: "Choose where to serve",
    detail: "Cameras, sound, slides or directing, with training and a mentor.",
  },
];

/**
 * The public "I want to serve" page (docs/decisions/2026-11-01-onboarding-pathways.md). Works signed
 * out; the lobby QR code opens it. Sending it starts the "Join the team" pathway.
 */
export default async function ServeWithUsPage() {
  const departments = await getOpenDepartments();
  return (
    <main id="main" className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="grid w-full max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4 rounded-card border border-border bg-[linear-gradient(160deg,var(--accent-soft),var(--surface)_60%)] p-6 sm:p-8">
          <Wordmark />
          <p className="eyebrow">Immanuel Fellowship Church · Production team</p>
          <h1 className="text-display font-semibold text-balance">Serve behind the scenes</h1>
          <p className="max-w-[52ch] text-lead text-text-secondary">
            Cameras, sound, slides and lights help everyone take part in worship. No experience
            needed: we&apos;ll train you at your own pace, alongside someone who&apos;s done it.
          </p>
          <h2 className="mt-2 font-semibold">What happens next</h2>
          <ol className="flex flex-col gap-3">
            {NEXT.map((step, i) => (
              <li
                key={step.title}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-pill bg-accent-soft text-small font-semibold text-accent-light"
                >
                  {i + 1}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{step.title}</span>
                  <span className="text-small text-text-muted">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <InterestForm departments={departments} />
      </div>
    </main>
  );
}
