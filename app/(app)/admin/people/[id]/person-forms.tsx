"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DepartmentOption, RoleOption } from "@/lib/data/admin/people";
import type { AccountStatusChange } from "@/lib/domain/admin";
import {
  grantRoleAction,
  revokeRoleAction,
  setAccountStatusAction,
  type FormState,
} from "./actions";

const idle: FormState = { status: "idle" };

const fieldClasses =
  "min-h-control rounded-button border border-border-strong bg-surface px-3 text-body text-text";

function Result({ state, id }: { state: FormState; id: string }) {
  if (state.status === "idle") {
    return null;
  }
  return (
    <p
      id={id}
      role={state.status === "error" ? "alert" : "status"}
      className={`text-small ${state.status === "error" ? "text-error" : "text-text-secondary"}`}
    >
      {state.message}
    </p>
  );
}

export function GrantRoleForm({
  userId,
  roles,
  departments,
}: {
  userId: string;
  roles: RoleOption[];
  departments: DepartmentOption[];
}) {
  const [state, formAction, pending] = useActionState(grantRoleAction, idle);
  const [roleId, setRoleId] = useState("");
  const departmentFieldId = useId();
  const resultId = useId();
  const role = roles.find((option) => option.id === roleId);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="userId" value={userId} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-small text-text-secondary">
          Choose a role. Each one lists what it lets someone do.
        </legend>
        <div className="grid gap-3 lg:grid-cols-2">
          {roles.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer gap-3 rounded-card border border-border p-4 hover:bg-hover has-[:checked]:border-accent has-[:checked]:bg-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-light"
            >
              <input
                type="radio"
                name="roleId"
                value={option.id}
                checked={roleId === option.id}
                onChange={() => setRoleId(option.id)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium text-text">{option.name}</span>
                  <span className="eyebrow">
                    {option.departmentScoped ? "One department" : "Whole ministry"}
                  </span>
                </span>
                <span className="text-small text-text-secondary">{option.description}</span>
                {option.abilities.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5 text-small text-text-muted">
                    {option.abilities.map((ability) => (
                      <li key={ability} className="flex gap-2">
                        <span aria-hidden="true">–</span>
                        {ability}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-small text-text-muted">
                    Learns in the departments they join. No admin abilities.
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {role?.departmentScoped ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={departmentFieldId} className="text-small font-medium text-text-secondary">
            Department
          </label>
          <select id={departmentFieldId} name="departmentId" required className={fieldClasses}>
            <option value="">Choose a department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="departmentId" value="" />
      )}
      <Button
        type="submit"
        disabled={pending || !role}
        className="self-start"
        aria-describedby={state.status === "idle" ? undefined : resultId}
      >
        {pending ? "Granting…" : "Grant role"}
      </Button>
      <Result state={state} id={resultId} />
    </form>
  );
}

export function RevokeRoleForm({ userRoleId, label }: { userRoleId: string; label: string }) {
  const [state, formAction, pending] = useActionState(revokeRoleAction, idle);
  const resultId = useId();
  return (
    <details>
      <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
        Remove<span className="sr-only"> {label}</span>
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="userRoleId" value={userRoleId} />
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          className="self-start"
          aria-describedby={state.status === "idle" ? undefined : resultId}
        >
          Remove {label}
        </Button>
        <Result state={state} id={resultId} />
      </form>
    </details>
  );
}

export function AccountStatusForm({
  userId,
  change,
}: {
  userId: string;
  change: AccountStatusChange;
}) {
  const [state, formAction, pending] = useActionState(setAccountStatusAction, idle);
  const reasonId = useId();
  const resultId = useId();
  return (
    <details>
      <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
        {change.label}
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-3">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value={change.to} />
        {change.needsReason ? (
          <>
            <label htmlFor={reasonId} className="text-small text-text-secondary">
              Reason (kept with the account history)
            </label>
            <input id={reasonId} name="reason" required maxLength={500} className={fieldClasses} />
          </>
        ) : null}
        <Button
          type="submit"
          variant={change.to === "active" ? "primary" : "destructive"}
          disabled={pending}
          className="self-start"
          aria-describedby={state.status === "idle" ? undefined : resultId}
        >
          {change.label} account
        </Button>
        <Result state={state} id={resultId} />
      </form>
    </details>
  );
}
