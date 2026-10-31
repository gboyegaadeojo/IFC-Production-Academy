import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getSopLibrary, sopTitle } from "@/lib/data/sops";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import { matchesSearch, SOP_STATE_LABELS } from "@/lib/domain/sops";

export const metadata: Metadata = { title: "SOP library" };

export default function SopLibraryPage({ searchParams }: PageProps<"/sops">) {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * SOP library (SPEC §7 "SOP library", SRS-SOP-001): search, department and category filters,
 * status, last reviewed, and owner. Members see their departments' current SOPs.
 */
async function LibraryContent({ searchParams }: Pick<PageProps<"/sops">, "searchParams">) {
  await requireActiveUser();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const department = typeof query.department === "string" ? query.department : "";
  const category = typeof query.category === "string" ? query.category : "";
  const all = await getSopLibrary();
  const departments = [...new Map(all.map((sop) => [sop.department.id, sop.department])).values()];
  const categories = [...new Set(all.map((sop) => sop.category).filter(Boolean))].toSorted();
  const shown = all.filter(
    (sop) =>
      (department === "" || sop.department.id === department) &&
      (category === "" || sop.category === category) &&
      matchesSearch(
        { title: sopTitle(sop), summary: sop.current?.summary ?? "", category: sop.category },
        q,
      ),
  );
  const filtered = q !== "" || department !== "" || category !== "";

  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
      <PageHeader
        title="SOP library"
        description="Standard operating procedures for the departments you belong to. Each one shows whether it's current and when it was last reviewed."
      />

      {all.length > 0 ? (
        <form role="search" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="sop-search" className="text-small font-medium text-text-secondary">
              Search
            </label>
            <input
              id="sop-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              className={fieldClasses}
            />
          </div>
          {departments.length > 1 ? (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="sop-department"
                className="text-small font-medium text-text-secondary"
              >
                Department
              </label>
              <select
                id="sop-department"
                name="department"
                defaultValue={department}
                className={fieldClasses}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {categories.length > 0 ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="sop-category" className="text-small font-medium text-text-secondary">
                Category
              </label>
              <select
                id="sop-category"
                name="category"
                defaultValue={category}
                className={fieldClasses}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      ) : null}

      {all.length === 0 ? (
        <EmptyState title="No SOPs here yet">
          SOPs appear here once a department you belong to publishes them. Join a department from
          Home to see its procedures.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          action={
            <Link
              href="/sops"
              className="text-small text-accent-light underline-offset-4 hover:underline"
            >
              Clear the search
            </Link>
          }
        >
          Try other words, or another department or category.
        </EmptyState>
      ) : (
        <section aria-labelledby="sop-results" className="flex flex-col gap-3">
          <h2 id="sop-results" className="sr-only">
            {filtered ? `${shown.length} matching SOPs` : "All SOPs"}
          </h2>
          {filtered ? (
            <p role="status" className="text-small text-text-muted">
              {shown.length === 1 ? "1 SOP matches." : `${shown.length} SOPs match.`}
            </p>
          ) : null}
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.map((sop) => {
              const style = { "--dept": departmentHueVar(sop.department.hue) } as CSSProperties;
              return (
                <li key={sop.id} style={style}>
                  <Link
                    href={`/sops/${sop.id}`}
                    className="flex h-full flex-col gap-2 rounded-card border border-l-2 border-border border-l-[var(--dept)] bg-card p-5 transition-surface hover:bg-hover"
                  >
                    <span className="text-small text-text-muted">
                      {sop.department.name}
                      {sop.category ? ` · ${sop.category}` : ""}
                    </span>
                    <span className="font-semibold text-text">{sopTitle(sop)}</span>
                    {sop.current?.summary ? (
                      <span className="line-clamp-2 text-small text-text-secondary">
                        {sop.current.summary}
                      </span>
                    ) : null}
                    <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-small text-text-muted">
                      <StatusBadge tone={sop.state === "current" ? "success" : "pending"}>
                        {SOP_STATE_LABELS[sop.state]}
                      </StatusBadge>
                      {sop.lastReviewedAt ? (
                        <span>Reviewed {formatDate(sop.lastReviewedAt)}</span>
                      ) : null}
                      {sop.ownerName ? <span>Owner: {sop.ownerName}</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the SOP library…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-12 max-w-2xl" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}
