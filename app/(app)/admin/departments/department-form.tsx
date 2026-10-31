"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DepartmentSettings } from "@/lib/data/admin/departments";
import { updateDepartmentAction, type DepartmentFormState } from "./actions";

const idle: DepartmentFormState = { status: "idle" };

/** What each status means for volunteers (DESIGN §7.7). Training history never changes. */
const STATUS_CONSEQUENCES: Record<DepartmentSettings["status"], string> = {
  active: "Volunteers can see it, ask to join, and members can open its courses.",
  coming_soon: "Volunteers can see it and what it will teach, but can't join yet.",
  inactive: "Hidden from volunteers. Members keep their history but can't open its training.",
};

const fieldClasses =
  "min-h-control rounded-button border border-border-strong bg-surface px-3 text-body text-text";

export function DepartmentForm({ department }: { department: DepartmentSettings }) {
  const [state, formAction, pending] = useActionState(updateDepartmentAction, idle);
  const [status, setStatus] = useState(department.status);
  const ids = {
    name: useId(),
    summary: useId(),
    status: useId(),
    enrolment: useId(),
    result: useId(),
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="departmentId" value={department.id} />
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.name} className="text-small font-medium text-text-secondary">
          Name
        </label>
        <input
          id={ids.name}
          name="name"
          required
          maxLength={80}
          defaultValue={department.name}
          className={fieldClasses}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.summary} className="text-small font-medium text-text-secondary">
          Summary
        </label>
        <textarea
          id={ids.summary}
          name="summary"
          rows={2}
          maxLength={300}
          defaultValue={department.summary}
          className={`${fieldClasses} py-3`}
        />
      </div>
      <div className="grid gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.status} className="text-small font-medium text-text-secondary">
            Status
          </label>
          <select
            id={ids.status}
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as DepartmentSettings["status"])}
            aria-describedby={`${ids.status}-consequence`}
            className={fieldClasses}
          >
            <option value="active">Active: open to volunteers</option>
            <option value="coming_soon">Coming soon: visible, not joinable</option>
            <option value="inactive">Inactive: hidden from volunteers</option>
          </select>
          <p id={`${ids.status}-consequence`} className="text-small text-text-secondary">
            {STATUS_CONSEQUENCES[status]}
            {status !== department.status ? " This takes effect when you save." : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.enrolment} className="text-small font-medium text-text-secondary">
            How people join
          </label>
          <select
            id={ids.enrolment}
            name="enrolmentMode"
            defaultValue={department.enrolmentMode}
            className={fieldClasses}
          >
            <option value="request">Volunteers request, a leader approves</option>
            <option value="invite_only">By invitation only</option>
          </select>
        </div>
      </div>
      <label className="flex min-h-control items-center gap-3">
        <input
          type="checkbox"
          name="curriculumRequiresReview"
          defaultChecked={department.curriculumRequiresReview}
          className="size-5 accent-[var(--accent)]"
        />
        A second person publishes curriculum changes
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          disabled={pending}
          aria-describedby={state.status === "idle" ? undefined : ids.result}
        >
          {pending ? "Saving…" : "Save changes"}
          <span className="sr-only"> to {department.name}</span>
        </Button>
        {state.status === "idle" ? null : (
          <p
            id={ids.result}
            role={state.status === "error" ? "alert" : "status"}
            className={`text-small ${state.status === "error" ? "text-error" : "text-text-secondary"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
