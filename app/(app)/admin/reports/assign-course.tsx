"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { assignableMatches, type AssignablePerson } from "@/lib/domain/course-progress";
import { assignCourseAction } from "./actions";

/** Search people, choose one, and assign (approved mock, Design B, 2026-11-04; ADD-REPORT-03). */
export function AssignCourse({
  courseId,
  departmentId,
  people,
  assignedIds,
}: {
  courseId: string;
  departmentId: string;
  people: readonly AssignablePerson[];
  assignedIds: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const { matches, more } = assignableMatches(people, assignedIds, query);
  return (
    <ActionForm
      action={assignCourseAction}
      submitLabel="Assign"
      pendingLabel="Assigning…"
      hidden={{ courseId, departmentId }}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="assign-who" className="text-small text-text-secondary">
          Who should take this course?
        </label>
        <input
          id="assign-who"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          autoComplete="off"
          maxLength={60}
          className={`${fieldClasses} w-full`}
        />
      </div>
      {matches.length === 0 ? (
        <p className="text-small text-text-secondary">Nobody else matches that.</p>
      ) : (
        <fieldset className="flex flex-col">
          <legend className="sr-only">Choose a person</legend>
          {matches.map((person) => (
            <label
              key={person.userId}
              className="flex min-h-touch items-center gap-2.5 rounded-button px-2 transition-surface hover:bg-hover"
            >
              <input type="radio" name="userId" value={person.userId} required />
              {person.name}
            </label>
          ))}
          {more ? (
            <p className="px-2 pt-1 text-small text-text-muted">
              Keep typing to find someone else.
            </p>
          ) : null}
        </fieldset>
      )}
      <p className="text-small text-text-muted">
        They&apos;ll see it on Training. It doesn&apos;t stop them doing anything else, and it
        doesn&apos;t add them to a team.
      </p>
    </ActionForm>
  );
}
