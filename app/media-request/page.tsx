import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { getCopyrightForm } from "@/lib/data/copyright";
import { deadlineWording } from "@/lib/domain/copyright";
import { RequestForm } from "./request-form";

export const metadata: Metadata = {
  title: "Ask to show a video or graphic",
  description: "Ask the production team to check a video or graphic for a livestream.",
};

/**
 * The public video and graphics request page (ADD-COPY-01; decision 2026-11-12). Works signed out,
 * replacing the church's JotForm. While approvals are switched off it says requests are paused.
 */
export default async function MediaRequestPage() {
  const form = await getCopyrightForm();
  const deadline = { days: form.deadlineDays, counting: form.deadlineCounting };
  const wording = deadlineWording(deadline);
  return (
    <main id="main" className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <section className="flex flex-col gap-3">
          <Wordmark />
          <h1 className="text-display font-semibold text-balance">
            Ask to show a video or graphic
          </h1>
          <p className="max-w-[60ch] text-lead text-text-secondary">
            {form.introText.replaceAll("{deadline}", wording) ||
              `Everything shown during a livestream is checked for copyright first. Send it at least ${wording} before the service and we'll email you the answer.`}
          </p>
        </section>
        {form.open ? (
          <RequestForm today={form.today} deadline={deadline} latePolicy={form.latePolicy} />
        ) : (
          <div role="status" className="rounded-card border border-border bg-surface p-6">
            <h2 className="text-heading font-semibold">Requests are paused right now</h2>
            <p className="mt-2 text-text-secondary">
              Please ask the production team directly, or try again later.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
