import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getHiddenItems, listTaskLists } from "@/lib/data/checklists";
import { hiddenKindLabel, restoreWithParentsLabel } from "@/lib/domain/checklists";
import { TIME_ZONE } from "@/lib/domain/schedule";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { restoreAction } from "../actions";

export const metadata: Metadata = { title: "Hidden items" };

type Props = PageProps<"/admin/checklists/hidden">;

export default function HiddenItemsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading hidden items…" />}>
      <HiddenItemsContent searchParams={searchParams} />
    </Suspense>
  );
}

const WHEN = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Everything hidden from a task list, newest first, with Restore (checklist app US-13a). Hiding
 * never erases: a restored item is the same item, with its history, back in its old place.
 */
async function HiddenItemsContent({ searchParams }: Pick<Props, "searchParams">) {
  const { allowed } = await getAdminAccess("checklists");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { list } = await searchParams;
  const lists = (await listTaskLists()).filter((l) => !l.hiddenAt);
  const selected = lists.find((l) => l.id === list) ?? lists.find((l) => l.isDefault) ?? lists[0];
  const items = selected ? await getHiddenItems(selected.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            {
              label: "Pre-service checklists",
              href: selected ? `/admin/checklists?list=${selected.id}` : "/admin/checklists",
            },
            { label: "Hidden items" },
          ]}
        />
        <h1 className="text-title font-semibold">Hidden items</h1>
        <p className="max-w-2xl text-text-secondary">
          Department checklists, sections and tasks removed from {selected?.name ?? "this list"},
          newest first. Restoring brings back the same item, with its history, where it was.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState title="Nothing is hidden">
          Anything you remove from this list shows up here, so you can bring it back.
        </EmptyState>
      ) : (
        <ul
          aria-label="Hidden items, newest first"
          className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border"
        >
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-2 px-4 py-3">
              <span className="text-small text-text-muted">
                {hiddenKindLabel(item.kind)} · {item.place} · Hidden{" "}
                {WHEN.format(new Date(item.hiddenAt))}
              </span>
              <span className="font-medium text-text">{item.name}</span>
              {item.kind === "checklist" ? (
                <p className="text-small text-text-secondary">
                  Its position links were removed when it was hidden. Link them again after
                  restoring.
                </p>
              ) : null}
              {item.parentHidden ? (
                <>
                  <p className="text-small text-text-secondary">
                    What it belongs to is hidden too, so it can&apos;t come back on its own.
                  </p>
                  <ActionForm
                    action={restoreAction}
                    submitLabel={restoreWithParentsLabel(item.kind)}
                    pendingLabel="Restoring…"
                    variant="secondary"
                    srLabel={item.name}
                    hidden={{ kind: item.kind, id: item.id, withParents: "true" }}
                  />
                </>
              ) : (
                <ActionForm
                  action={restoreAction}
                  submitLabel="Restore"
                  pendingLabel="Restoring…"
                  variant="secondary"
                  srLabel={item.name}
                  hidden={{ kind: item.kind, id: item.id, withParents: "false" }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
