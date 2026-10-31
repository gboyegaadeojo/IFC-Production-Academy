import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getMentoringAdmin } from "@/lib/data/mentoring";
import { formatDate } from "@/lib/domain/dates";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { assignMentorAction, endMentoringAction } from "./actions";

export const metadata: Metadata = { title: "Mentoring" };

export default function AdminMentoringPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading mentoring…" />}>
      <AdminMentoringContent />
    </Suspense>
  );
}

/**
 * Pair mentors with volunteers (SRS-MENTOR-001). Leaders see pairings and shared notes, never a
 * mentor's private notes (SRS-RBAC-006).
 */
async function AdminMentoringContent() {
  const { grants, allowed } = await getAdminAccess("mentoring");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await getMentoringAdmin(grants);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Mentoring"
        description="Pair a volunteer with a trainer or leader. They share goals and notes; a mentor's private notes stay private, even from you."
      />
      {departments.map((department) => {
        const mentors = department.people.filter((p) => p.canMentor);
        const mentees = department.people.filter((p) => p.isMember);
        const active = department.pairings.filter((p) => p.endedAt === null);
        return (
          <section
            key={department.id}
            aria-labelledby={`mentoring-${department.id}`}
            className="flex flex-col gap-4"
          >
            <h2 id={`mentoring-${department.id}`} className="text-heading font-semibold">
              {department.name}
            </h2>
            {active.length === 0 ? (
              <EmptyState title="No pairings yet">
                Pair a volunteer with someone who can mentor them.
              </EmptyState>
            ) : (
              <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
                {active.map((pairing) => (
                  <li key={pairing.id} className="flex flex-col gap-2 p-4">
                    <p className="font-medium">
                      {pairing.mentorName} mentoring {pairing.menteeName}
                    </p>
                    <p className="text-small text-text-muted">
                      Since {formatDate(pairing.startedAt)}
                    </p>
                    <details>
                      <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
                        End this pairing
                        <span className="sr-only">
                          {" "}
                          of {pairing.mentorName} and {pairing.menteeName}
                        </span>
                      </summary>
                      <div className="mt-2">
                        <ActionForm
                          action={endMentoringAction}
                          submitLabel="End pairing"
                          pendingLabel="Ending…"
                          variant="destructive"
                          hidden={{ relationshipId: pairing.id }}
                        >
                          <Field id={`end-${pairing.id}`} label="Reason (optional)">
                            <input
                              id={`end-${pairing.id}`}
                              name="reason"
                              maxLength={300}
                              className={fieldClasses}
                            />
                          </Field>
                        </ActionForm>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {mentors.length > 0 && mentees.length > 0 ? (
              <div className="max-w-3xl rounded-card border border-dashed border-border p-5">
                <ActionForm
                  action={assignMentorAction}
                  submitLabel="Pair them"
                  pendingLabel="Pairing…"
                  variant="secondary"
                  hidden={{ departmentId: department.id }}
                  className="flex flex-col gap-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id={`mentor-${department.id}`} label="Mentor">
                      <select
                        id={`mentor-${department.id}`}
                        name="mentorId"
                        className={fieldClasses}
                      >
                        {mentors.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id={`mentee-${department.id}`} label="Volunteer">
                      <select
                        id={`mentee-${department.id}`}
                        name="menteeId"
                        className={fieldClasses}
                      >
                        {mentees.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </ActionForm>
              </div>
            ) : (
              <p className="text-small text-text-muted">
                Pairing needs at least one trainer or leader and one member in this department.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
