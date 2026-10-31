import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="People and roles"
        description="Everyone who has signed in. Open a person to change their roles or account status; changes are recorded in the audit log."
      />

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
            className="min-h-control rounded-button border border-border-strong bg-surface px-3 text-body text-text"
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
        <EmptyState title={query ? "No one matches that search" : "No one has signed in yet"}>
          {query
            ? "Check the spelling, or search by part of their email address."
            : "People appear here after they sign in for the first time."}
        </EmptyState>
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[46rem] text-left text-small">
            <caption className="sr-only">People, sorted by name</caption>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Person
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Roles
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Account
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {people.map((person) => (
                <tr key={person.id} className="transition-surface hover:bg-card">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/people/${person.id}`}
                      className="flex items-center gap-3 rounded-button"
                    >
                      <Avatar name={person.displayName} size="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-text underline-offset-4 hover:underline">
                          {person.displayName}
                        </span>
                        {person.email ? (
                          <span className="truncate text-text-secondary">{person.email}</span>
                        ) : null}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {person.roles.length === 0 ? (
                      <span className="text-text-muted">No roles</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {person.roles.map((role) => (
                          <li
                            key={`${role.roleName}-${role.departmentName ?? "all"}`}
                            className="rounded-pill border border-border px-2 py-0.5"
                          >
                            {role.departmentName
                              ? `${role.roleName}, ${role.departmentName}`
                              : role.roleName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={person.status === "active" ? "success" : "pending"}>
                      {ACCOUNT_STATUS_LABELS[person.status]}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                    {formatDateTime(person.joinedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
