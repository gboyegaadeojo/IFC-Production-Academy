import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards } from "@/lib/data/departments";
import { getVideoLibrary, listTopics } from "@/lib/data/topics";
import { topicVideoCounts, videoCountLabel } from "@/lib/domain/videos";

export const metadata: Metadata = { title: "Topics" };

export default function TopicsPage() {
  return (
    <Suspense fallback={<TopicsSkeleton />}>
      <Topics />
    </Suspense>
  );
}

/** Find every video on something, whichever course it's in (SRS-CUR-019). */
async function Topics() {
  const user = await requireActiveUser();
  const categories = await listDepartmentCards(user.id);
  const [topics, videos] = await Promise.all([listTopics(), getVideoLibrary(categories)]);
  const counts = topicVideoCounts(videos);
  return (
    <div className="page-container flex flex-col gap-5 py-6 sm:py-8 lg:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Topics</h1>
        <p className="max-w-[40rem] text-text-secondary">
          Find every video on something you want to learn, whichever course it&apos;s in.
        </p>
      </div>
      {topics.length === 0 ? (
        <EmptyState title="No topics yet">
          Topics appear here when leaders tag their lessons.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/videos?topic=${topic.id}`}
                prefetch={false}
                className="flex lift flex-col gap-0.5 rounded-card border border-border bg-surface p-3.5"
              >
                <span className="font-semibold text-text">{topic.name}</span>
                <span className="text-small text-text-muted">
                  {videoCountLabel(counts.get(topic.id) ?? 0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopicsSkeleton() {
  return (
    <div className="page-container flex flex-col gap-5 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the topics…" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
