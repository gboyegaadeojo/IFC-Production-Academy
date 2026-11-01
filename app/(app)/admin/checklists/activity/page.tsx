import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { getAdminAccess } from "@/lib/data/admin/access";
import {
  getChecklistActivity,
  getCurrentServiceId,
  getRecentServices,
} from "@/lib/data/checklists";
import { formatDateTime } from "@/lib/domain/admin";
import { activityActionLabel, activityChange, activityOutcomeLabel } from "@/lib/domain/checklists";
import { formatDate } from "@/lib/domain/dates";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";

export const metadata: Metadata = { title: "Checklist activity" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["all", "checkoff", "edit"] as const;
type Kind = (typeof KINDS)[number];

export default function ChecklistActivityPage({
  searchParams,
}: PageProps<"/admin/checklists/activity">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the activity log…" />}>
      <ActivityContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The checklist activity log (checklist app US-07a, US-13b): every tick, untick, reset, undo,
 * and checklist edit, including refused attempts, newest first. It can't be changed.
 */
async function ActivityContent({
  searchParams,
}: Pick<PageProps<"/admin/checklists/activity">, "searchParams">) {
  const { allowed } = await getAdminAccess("checklists");
  if (!allowed) {
    return <AccessDenied />;
  }
  const params = await searchParams;
  const kind: Kind = KINDS.includes(params.kind as Kind) ? (params.kind as Kind) : "all";
  const [services, current] = await Promise.all([getRecentServices(), getCurrentServiceId()]);
  const serviceId =
    typeof params.service === "string" && UUID.test(params.service)
      ? params.service
      : (current ?? services[0]?.id ?? null);
  const entries = await getChecklistActivity({ eventId: serviceId, kind });
  const href = (next: { kind?: Kind; service?: string | null }) => {
    const search = new URLSearchParams();
    const nextKind = next.kind ?? kind;
    const nextService = next.service === undefined ? serviceId : next.service;
    if (nextKind !== "all") {
      search.set("kind", nextKind);
    }
    if (nextService) {
      search.set("service", nextService);
    }
    const text = search.toString();
    return text ? `/admin/checklists/activity?${text}` : "/admin/checklists/activity";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Checklist activity"
        description="Every tick, untick, reset, and undo at a service, including attempts that were refused, and every change to the checklists. This record can't be edited or deleted."
      />
      <Tabs
        label="What to show"
        tabs={[
          { href: href({ kind: "all" }), label: "Both", current: kind === "all" },
          { href: href({ kind: "checkoff" }), label: "Check-offs", current: kind === "checkoff" },
          { href: href({ kind: "edit" }), label: "Checklist edits", current: kind === "edit" },
        ]}
      />
      {kind !== "edit" && services.length > 0 ? (
        <nav aria-label="Choose a service" className="flex flex-wrap gap-2">
          {services.map((service) => (
            <Link
              key={service.id}
              href={href({ service: service.id })}
              aria-current={service.id === serviceId ? "true" : undefined}
              className={`inline-flex min-h-control items-center rounded-pill border px-3 text-small transition-surface ${
                service.id === serviceId
                  ? "border-accent-light bg-hover font-medium text-text"
                  : "border-border text-text-secondary hover:border-border-strong hover:text-text"
              }`}
            >
              {service.title}, {formatDate(service.startsAt)}
            </Link>
          ))}
        </nav>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState title="Nothing recorded yet">
          Ticks, resets, and checklist changes appear here as they happen.
        </EmptyState>
      ) : (
        <ol
          aria-label="Activity, newest first"
          className="flex max-w-4xl flex-col divide-y divide-border rounded-card border border-border"
        >
          {entries.map((entry) => {
            const outcome = activityOutcomeLabel(entry.outcome, entry.reason);
            const change = activityChange(entry.before, entry.after);
            return (
              <li key={entry.id} className="flex flex-col gap-1 px-4 py-3 text-small">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{entry.actorName || "The system"}</span>
                  <span className="text-text-secondary">{activityActionLabel(entry.action)}</span>
                  <StatusBadge tone={entry.kind === "edit" ? "info" : "neutral"}>
                    {entry.kind === "edit" ? "Edit" : "Check-off"}
                  </StatusBadge>
                  {outcome ? (
                    <StatusBadge tone={entry.outcome === "refused" ? "pending" : "neutral"}>
                      {outcome}
                    </StatusBadge>
                  ) : null}
                </span>
                {entry.subject ? <span className="text-text">{entry.subject}</span> : null}
                {change ? <span className="text-text-secondary">{change}</span> : null}
                <span className="text-text-muted">
                  {formatDateTime(entry.happenedAt)}
                  {entry.tabId ? ` · tab ${entry.tabId.slice(0, 8)}` : ""}
                  {entry.sessionId ? ` · session ${entry.sessionId.slice(0, 8)}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
