import type { Metadata } from "next";
import { Suspense } from "react";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards } from "@/lib/data/departments";
import { DepartmentCard } from "./department-card";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await requireActiveUser();
  const departments = await listDepartmentCards(user.id);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="welcome-heading" className="flex max-w-2xl flex-col gap-3">
        <h1 id="welcome-heading" className="text-title font-semibold">
          Welcome, {user.displayName}
        </h1>
        <p className="text-lead text-text-secondary">
          Choose a department to start learning. A leader reviews each request. Joining gives you
          the department&apos;s training; approval to serve comes later, once you&apos;ve shown the
          skills in a practical assessment.
        </p>
      </section>

      <section aria-labelledby="departments-heading" className="flex flex-col gap-5">
        <h2 id="departments-heading" className="text-heading font-semibold">
          Departments
        </h2>
        {departments.length === 0 ? (
          <p className="rounded-card border border-border bg-card p-6 text-text-secondary">
            No departments are open yet. Check back soon.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((department) => (
              <li key={department.id} className="flex">
                <DepartmentCard department={department} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your home page…
      </p>
      <div className="h-24 max-w-2xl rounded-card bg-card motion-safe:animate-pulse" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-72 rounded-card bg-card motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  );
}
