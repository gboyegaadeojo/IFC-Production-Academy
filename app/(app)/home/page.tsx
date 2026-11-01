import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRightIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMyAchievements } from "@/lib/data/achievements";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards, type DepartmentCard as CardData } from "@/lib/data/departments";
import { getDepartmentLearning } from "@/lib/data/learning";
import { getContinueLearning } from "@/lib/data/progress";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import { homeState, type HomeState } from "@/lib/domain/home";
import { firstName } from "@/lib/domain/people";
import { ExploreRow, MemberDepartmentCard } from "./department-card";

export const metadata: Metadata = { title: "Training" };

export default function TrainingPage() {
  return (
    <Suspense fallback={<TrainingSkeleton />}>
      <TrainingContent />
    </Suspense>
  );
}

/**
 * Training, the learner home (DESIGN §6.1; approved mock, 2026-11-01). One primary task per state:
 * - new: introduce the Academy and point to the departments
 * - pending: show the request status first
 * - member: one card per department you belong to, with level progress and one next step
 * "Other departments" lists only those you haven't joined, so nothing appears twice.
 */
async function TrainingContent() {
  const user = await requireActiveUser();
  const departments = await listDepartmentCards(user.id);
  const state = homeState(departments);
  const memberOf = departments.filter((d) => d.state.kind === "member");
  const others = departments.filter((d) => d.state.kind !== "member");
  const requested = departments.filter((d) => d.state.kind === "requested");
  const memberIds = memberOf.map((d) => d.id);
  const [learning, continuing, achievements] = await Promise.all([
    getDepartmentLearning(user.id, memberIds),
    getContinueLearning(user.id, memberIds),
    memberOf.length > 0 ? getMyAchievements(user.id) : null,
  ]);
  const learningFor = new Map(learning.map((entry) => [entry.departmentId, entry]));

  return (
    <div className="page-container flex flex-col gap-12 py-8 lg:gap-14 lg:py-12">
      <Hero name={firstName(user.displayName) || user.displayName} state={state} />

      {requested.length > 0 ? <RequestStatus requests={requested} /> : null}

      {memberOf.length > 0 ? (
        <section aria-labelledby="my-departments-heading" className="flex flex-col gap-4">
          <SectionHeading id="my-departments-heading" eyebrow="Your departments">
            Keep learning
          </SectionHeading>
          <ul className="grid gap-4 lg:grid-cols-2">
            {memberOf.map((department) => (
              <li key={department.id}>
                <MemberDepartmentCard
                  department={department}
                  learning={learningFor.get(department.id)}
                  continuing={continuing.find((c) => c.course.department.id === department.id)}
                  approvedRoles={(achievements?.approvedRoles ?? [])
                    .filter((role) => role.departmentId === department.id)
                    .map((role) => role.roleName)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HowTrainingWorks />

      <section
        id="departments"
        aria-labelledby="departments-heading"
        className="flex scroll-mt-20 flex-col gap-4"
      >
        <SectionHeading id="departments-heading" eyebrow="Explore">
          {memberOf.length > 0 ? "Other departments" : "Departments"}
        </SectionHeading>
        {departments.length === 0 ? (
          <EmptyState title="No departments are open yet">
            The production team is setting up its training. Check back soon, or ask a leader when
            your department opens.
          </EmptyState>
        ) : others.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-4 text-small text-text-secondary">
            You&apos;re in every open department. New ones appear here when they open.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {others.map((department) => (
              <li key={department.id} className="flex">
                <ExploreRow department={department} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow: string;
  children: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="text-heading font-semibold">
        {children}
      </h2>
    </div>
  );
}

function Hero({ name, state }: { name: string; state: HomeState }) {
  const lead: Record<HomeState, string> = {
    new: "Learn the craft behind every service. Pick a department, learn its gear and routines at your own pace, and grow into serving with the production team.",
    pending:
      "Your request is with a department leader. While you wait, have a look at the other departments.",
    member:
      "Pick up where you left off. Courses appear in each department as leaders publish them.",
  };

  return (
    <section aria-labelledby="welcome-heading" className="flex flex-col gap-4">
      <p className="eyebrow">Your training</p>
      <h1 id="welcome-heading" className="text-display font-semibold text-balance">
        {state === "member" ? `Welcome back, ${name}` : `Welcome, ${name}`}
      </h1>
      <p className="max-w-[40rem] text-lead text-text-secondary">{lead[state]}</p>
      {state === "new" ? (
        <div>
          <a href="#departments" className={buttonClasses("primary", "gap-2")}>
            Explore departments
            <ArrowRightIcon className="size-4" />
          </a>
        </div>
      ) : null}
    </section>
  );
}

function RequestStatus({ requests }: { requests: CardData[] }) {
  return (
    <section
      aria-labelledby="requests-heading"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Membership</p>
        <h2 id="requests-heading" className="text-heading font-semibold">
          {requests.length === 1 ? "Your request" : "Your requests"}
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {requests.map((request) => (
          <li
            key={request.id}
            style={{ "--dept": departmentHueVar(request.hue) } as CSSProperties}
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-[var(--dept)]">
                <DepartmentIcon icon={request.icon} className="size-5" />
              </span>
              <div className="flex flex-col">
                <span className="font-medium">{request.name}</span>
                {request.since ? (
                  <span className="text-small text-text-muted">
                    Asked {formatDateTime(request.since)}
                  </span>
                ) : null}
              </div>
            </div>
            <StatusBadge tone="pending">Waiting for a leader</StatusBadge>
          </li>
        ))}
      </ul>
      <p className="text-small text-text-secondary">
        A leader reviews each request. When it&apos;s approved, the department&apos;s training
        appears on this page.
      </p>
    </section>
  );
}

/** Keeps membership, completion, and approval to serve visibly separate (SPEC §3, DESIGN §10). */
function HowTrainingWorks() {
  const steps = [
    {
      title: "Join a department",
      body: "Ask to join, or accept a leader's invitation. Joining opens its training.",
    },
    {
      title: "Learn and practise",
      body: "Work through each level's lessons and quizzes, then show the skills in a hands-on check.",
    },
    {
      title: "Approved to serve",
      body: "Granted when you pass the practical a role needs. Finishing lessons alone doesn't approve you.",
    },
  ];
  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-4">
      <SectionHeading id="how-heading" eyebrow="How it works">
        From joining to serving
      </SectionHeading>
      <ol className="grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-1.5 bg-bg p-5">
            <span className="tabular font-mono text-small text-accent-light">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-medium">{step.title}</span>
            <span className="text-small text-text-secondary">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrainingSkeleton() {
  return (
    <div className="page-container flex flex-col gap-12 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading your training…" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-6 w-[36rem] max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-80" />
        ))}
      </div>
    </div>
  );
}
