import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyPairings } from "@/lib/data/mentoring";
import { formatDate } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Mentoring" };

export default function MentoringPage() {
  return (
    <Suspense fallback={<MentoringSkeleton />}>
      <MentoringContent />
    </Suspense>
  );
}

/** The person's mentoring pairings, as mentor or as volunteer (SRS-MENTOR-001). */
async function MentoringContent() {
  await requireActiveUser();
  const pairings = await getMyPairings();
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
      <PageHeader
        title="Mentoring"
        description="Goals and notes between a volunteer and their mentor."
      />
      {pairings.length === 0 ? (
        <EmptyState title="No mentoring yet">
          A department leader can pair you with a mentor. Ask them if you&apos;d like one.
        </EmptyState>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
          {pairings.map((pairing) => (
            <li key={pairing.id}>
              <Link
                href={`/mentoring/${pairing.id}`}
                className="flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-card sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-text">
                    {pairing.myPart === "mentor"
                      ? `Mentoring ${pairing.mentee.name}`
                      : `Mentored by ${pairing.mentor.name}`}
                  </span>
                  <span className="text-small text-text-muted">
                    {pairing.departmentName} · since {formatDate(pairing.startedAt)}
                  </span>
                </span>
                {pairing.endedAt ? <StatusBadge tone="neutral">Ended</StatusBadge> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MentoringSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading mentoring…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 max-w-3xl" />
    </div>
  );
}
