import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyProfile } from "@/lib/data/profile";
import { formatDateTime } from "@/lib/domain/admin";
import { membershipLabel } from "@/lib/domain/profile";
import { DisplayNameForm } from "./display-name-form";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  const user = await requireActiveUser();
  const profile = await getMyProfile(user.id);
  if (!profile) {
    notFound();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Your profile</h1>
        {profile.email ? (
          <p className="break-all text-text-secondary">
            You sign in with <span className="font-medium text-text">{profile.email}</span>
          </p>
        ) : null}
        <p className="text-small text-text-muted">Joined {formatDateTime(profile.joinedAt)}</p>
      </header>

      <section aria-labelledby="name-heading" className="flex flex-col gap-4">
        <h2 id="name-heading" className="text-heading font-semibold">
          Name
        </h2>
        <DisplayNameForm displayName={profile.displayName} />
      </section>

      <section aria-labelledby="departments-heading" className="flex flex-col gap-4">
        <h2 id="departments-heading" className="text-heading font-semibold">
          Your departments
        </h2>
        {profile.memberships.length === 0 ? (
          <p className="text-text-secondary">
            You haven&apos;t asked to join a department yet. Pick one on your home page.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {profile.memberships.map((membership) => (
              <li
                key={membership.id}
                className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-semibold">{membership.departmentName}</span>
                <StatusBadge
                  tone={
                    membership.status === "active"
                      ? "success"
                      : membership.status === "requested"
                        ? "pending"
                        : "neutral"
                  }
                >
                  {membershipLabel(membership.status)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-small text-text-muted">
          Being a member gives you a department&apos;s training. Approval to serve comes separately,
          after a practical assessment.
        </p>
      </section>

      <section aria-labelledby="roles-heading" className="flex flex-col gap-4">
        <h2 id="roles-heading" className="text-heading font-semibold">
          Your roles
        </h2>
        <ul className="flex flex-wrap gap-2">
          {profile.roles.map((role) => (
            <li
              key={role.id}
              className="rounded-pill border border-border bg-surface px-3 py-1 text-small"
            >
              {role.departmentName ? `${role.roleName}, ${role.departmentName}` : role.roleName}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex max-w-3xl flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        Loading your profile…
      </p>
      <div className="h-20 rounded-card bg-card motion-safe:animate-pulse" />
      <div className="h-32 rounded-card bg-card motion-safe:animate-pulse" />
      <div className="h-40 rounded-card bg-card motion-safe:animate-pulse" />
    </div>
  );
}
