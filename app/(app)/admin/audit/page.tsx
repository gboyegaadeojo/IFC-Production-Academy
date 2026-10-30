import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { buttonClasses } from "@/components/ui/button";
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
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Audit log</h1>
        <p className="max-w-2xl text-text-secondary">
          Every sensitive change, newest first. Entries can&apos;t be edited or deleted. Times are
          Winnipeg time.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-card border border-border bg-card p-6 text-text-secondary">
          {before ? "No older entries." : "Nothing has been recorded yet."}
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-card border border-border bg-card">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 p-5">
              <p>
                <span className="font-semibold">
                  {entry.actor ? entry.actor.displayName : "System"}
                </span>
                <span className="text-text-secondary">: {entry.description}</span>
              </p>
              {entry.subject || entry.roleName || entry.departmentName ? (
                <p className="text-small text-text-secondary">
                  {[
                    entry.subject ? `Person: ${entry.subject.displayName}` : null,
                    entry.roleName ? `Role: ${entry.roleName}` : null,
                    entry.departmentName ? `Department: ${entry.departmentName}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              <p className="text-small text-text-muted">
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              </p>
            </li>
          ))}
        </ol>
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
