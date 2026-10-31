import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listAuditEntries, type AuditCursor } from "@/lib/data/admin/audit";
import { formatDateTime } from "@/lib/domain/admin";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the audit log…" />}>
      <AuditContent searchParams={searchParams} />
    </Suspense>
  );
}

const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() });

function toCursor(params: Record<string, string | string[] | undefined>): AuditCursor | null {
  const parsed = cursorSchema.safeParse({ at: params.before_at, id: params.before_id });
  return parsed.success ? { createdAt: parsed.data.at, id: parsed.data.id } : null;
}

async function AuditContent({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const { allowed } = await getAdminAccess("audit");
  if (!allowed) {
    return <AccessDenied />;
  }
  const before = toCursor(await searchParams);
  const { entries, next } = await listAuditEntries(before);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Every sensitive change, newest first. Entries can't be edited or deleted. Times are Winnipeg time."
      />

      {entries.length === 0 ? (
        <EmptyState title={before ? "No older entries" : "Nothing recorded yet"}>
          {before
            ? "You've reached the start of the log."
            : "Role changes, membership decisions, account changes, and publishing appear here."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[48rem] text-left text-small">
            <caption className="sr-only">Audit events, newest first</caption>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  When
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Who
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  What happened
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  About
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                    <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                  </td>
                  <td className="px-4 py-3 font-medium text-text">
                    {entry.actor ? entry.actor.displayName : "System"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    <details className="group">
                      <summary className="cursor-pointer list-none underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                        {entry.description}
                      </summary>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-text-muted">
                        <dt>Record</dt>
                        <dd className="font-mono">{entry.targetTable}</dd>
                        {entry.changedFields.length > 0 ? (
                          <>
                            <dt>Changed</dt>
                            <dd>
                              {entry.changedFields
                                .map((field) => field.replaceAll("_", " "))
                                .join(", ")}
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </details>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {[entry.subject?.displayName ?? null, entry.roleName, entry.departmentName]
                      .filter(Boolean)
                      .join(" · ") || <span className="text-text-muted">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Audit log pages" className="flex gap-3">
        {before ? (
          <Link href="/admin/audit" className={buttonClasses("secondary")}>
            Newest
          </Link>
        ) : null}
        {next ? (
          <Link
            href={`/admin/audit?${new URLSearchParams({ before_at: next.createdAt, before_id: next.id })}`}
            className={buttonClasses("secondary")}
          >
            Older entries
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
