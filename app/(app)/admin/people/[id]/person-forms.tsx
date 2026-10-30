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
  "min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text";

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
  const roleFieldId = useId();
  const departmentFieldId = useId();
  const resultId = useId();
  const role = roles.find((option) => option.id === roleId);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-col gap-2">
        <label htmlFor={roleFieldId} className="text-small font-medium text-text-secondary">
          Role
        </label>
        <select
          id={roleFieldId}
          name="roleId"
          required
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          className={fieldClasses}
        >
          <option value="">Choose a role</option>
          {roles.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        {role ? <p className="text-small text-text-muted">{role.description}</p> : null}
      </div>
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
      <summary className="flex min-h-11 cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
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
      <summary className="flex min-h-11 cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
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
