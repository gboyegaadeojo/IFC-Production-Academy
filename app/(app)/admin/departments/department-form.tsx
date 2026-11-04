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
  "min-h-control rounded-button border border-border-strong bg-surface px-3 text-field text-text";

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
            <option value="coming_soon">Coming soon (seen, can&apos;t join yet)</option>
            <option value="inactive">Hidden while you set it up</option>
          </select>
          <p id={`${ids.status}-consequence`} className="text-small text-text-secondary">
            {STATUS_CONSEQUENCES[status]}
            {status !== department.status ? " This takes effect when you save." : ""}
          </p>
        </div>
        {department.kind === "topic" ? (
          <input type="hidden" name="enrolmentMode" value={department.enrolmentMode} />
        ) : (
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
              <option value="request">They ask, a leader approves</option>
              <option value="open">Anyone can join, no approval</option>
              <option value="invite_only">By invitation only</option>
            </select>
          </div>
        )}
      </div>
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
