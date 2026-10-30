import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listPeople, type PersonRow } from "@/lib/data/admin/people";
import { ACCOUNT_STATUS_LABELS, formatDateTime } from "@/lib/domain/admin";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";

export const metadata: Metadata = { title: "People and roles" };

export default function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading people…" />}>
      <PeopleContent searchParams={searchParams} />
    </Suspense>
  );
}

function matches(person: PersonRow, query: string): boolean {
  const needle = query.toLocaleLowerCase("en-CA");
  return (
    person.displayName.toLocaleLowerCase("en-CA").includes(needle) ||
    (person.email ?? "").toLocaleLowerCase("en-CA").includes(needle)
  );
}

async function PeopleContent({ searchParams }: Pick<PageProps<"/admin/people">, "searchParams">) {
  const { allowed } = await getAdminAccess("people");
  if (!allowed) {
    return <AccessDenied />;
  }
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const everyone = await listPeople();
  const people = query ? everyone.filter((person) => matches(person, query)) : everyone;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">People and roles</h1>
        <p className="max-w-2xl text-text-secondary">
          Everyone who has signed in. Open a person to change their roles or account status. Changes
          are recorded in the audit log.
        </p>
      </header>

      <form role="search" className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="people-search" className="text-small font-medium text-text-secondary">
            Search by name or email
          </label>
          <input
            id="people-search"
            name="q"
            type="search"
            defaultValue={query}
            className="min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text"
          />
        </div>
        <button type="submit" className={buttonClasses("secondary")}>
          Search
        </button>
      </form>

      <p role="status" className="text-small text-text-secondary">
        {query
          ? `${people.length} of ${everyone.length} people match “${query}”.`
          : `${everyone.length} ${everyone.length === 1 ? "person" : "people"}.`}
      </p>

      {people.length === 0 ? (
        <p className="rounded-card border border-border bg-card p-6 text-text-secondary">
          No one matches that search.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-card">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/admin/people/${person.id}`}
                className="flex flex-col gap-2 p-5 hover:bg-hover sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{person.displayName}</span>
                  {person.email ? (
                    <span className="text-small break-all text-text-secondary">{person.email}</span>
                  ) : null}
                  <span className="text-small text-text-muted">
                    {person.roles.length === 0
                      ? "No roles"
                      : person.roles
                          .map((role) =>
                            role.departmentName
                              ? `${role.roleName}, ${role.departmentName}`
                              : role.roleName,
                          )
                          .join(" · ")}
                  </span>
                </span>
                <span className="flex flex-col items-start gap-1 sm:items-end">
                  <StatusBadge tone={person.status === "active" ? "success" : "pending"}>
                    {ACCOUNT_STATUS_LABELS[person.status]}
                  </StatusBadge>
                  <span className="text-small text-text-muted">
                    Joined {formatDateTime(person.joinedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
