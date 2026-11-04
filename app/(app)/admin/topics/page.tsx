import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listTopics } from "@/lib/data/topics";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createTopicAction, removeTopicAction, renameTopicAction } from "./actions";

export const metadata: Metadata = { title: "Lesson topics" };

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
        title="Lesson topics"
        description="Topics help people find videos, whichever course they're in. Add a topic here, or while editing a lesson, where you also choose each lesson's topics. Tags don't affect anyone's progress or approval."
      />
      <div className="max-w-xl rounded-card border border-border bg-surface p-4">
        <ActionForm
          action={createTopicAction}
          submitLabel="Add topic"
          pendingLabel="Adding…"
          className="flex flex-col gap-3"
        >
          <Field id="new-topic" label="New topic">
            <input id="new-topic" name="name" required maxLength={60} className={fieldClasses} />
          </Field>
        </ActionForm>
      </div>
      {topics.length === 0 ? (
        <EmptyState title="No topics yet">Add the first one above.</EmptyState>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {topics.map((topic) => (
            <li
              key={topic.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end sm:justify-between"
            >
              {canTidy ? (
                <>
                  <ActionForm
                    action={renameTopicAction}
                    submitLabel="Rename"
                    variant="secondary"
                    hidden={{ topicId: topic.id }}
                    srLabel={topic.name}
                    className="flex flex-1 flex-wrap items-end gap-3"
                  >
                    <Field id={`topic-${topic.id}`} label="Name">
                      <input
                        id={`topic-${topic.id}`}
                        name="name"
                        required
                        maxLength={60}
                        defaultValue={topic.name}
                        className={fieldClasses}
                      />
                    </Field>
                  </ActionForm>
                  <ActionForm
                    action={removeTopicAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    variant="tertiary"
                    hidden={{ topicId: topic.id }}
                    srLabel={`${topic.name} from every lesson`}
                  />
                </>
              ) : (
                <span className="font-medium">{topic.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canTidy ? null : (
        <p className="text-small text-text-muted">
          Production Directors can rename and remove topics. Ask one if a topic needs tidying.
        </p>
      )}
    </div>
  );
}
