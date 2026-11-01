import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireActiveUser } from "@/lib/data/auth";
import { openCurrentService } from "@/lib/data/checklists";

export const metadata: Metadata = { title: "Checklist" };

/**
 * Opens today's service, or the next one, as the checklist app does (its US-07). With nothing
 * published, the team still get the next service day's checklist.
 */
export default async function CurrentServicePage() {
  await requireActiveUser();
  const eventId = await openCurrentService();
  if (eventId) {
    redirect(`/serve/${eventId}`);
  }
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
      <PageHeader title="Checklist" description="The pre-service checklist for the next service." />
      <EmptyState title="No service on the schedule yet">
        When the next service is on the schedule, its checklist opens here.
      </EmptyState>
    </div>
  );
}
