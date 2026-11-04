import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listTopics } from "@/lib/data/topics";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { TopicChips } from "./topic-chips";

export const metadata: Metadata = { title: "Topics" };

export default function AdminTopicsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading topics…" />}>
      <AdminTopics />
    </Suspense>
  );
}

/** The topics leaders tag lessons with (SRS-CUR-019). Tagging itself happens in the lesson editor. */
async function AdminTopics() {
  const { grants, allowed } = await getAdminAccess("topics");
  if (!allowed) {
    return <AccessDenied />;
  }
  const topics = await listTopics();
  const canTidy = hasCapability(grants, "topic.manage");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Topics"
        description="Tag courses and lessons so people can find them under Courses and Videos. You choose their topics while editing them. Leaders of any department can add a topic, and Production Directors tidy the list."
      />
      <section
        aria-labelledby="topics-heading"
        className="flex max-w-[40rem] flex-col gap-3 rounded-card border border-border bg-surface p-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id="topics-heading" className="font-semibold">
            All topics
          </h2>
          <p className="text-small text-text-muted">
            {topics.length === 0
              ? "No topics yet. Add the first one."
              : canTidy
                ? "Choose a topic to rename or remove it."
                : "Production Directors can rename and remove topics."}
          </p>
        </div>
        <TopicChips topics={topics} canTidy={canTidy} />
      </section>
    </div>
  );
}
