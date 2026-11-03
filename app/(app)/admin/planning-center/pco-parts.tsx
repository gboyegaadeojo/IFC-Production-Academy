"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { type FormState, fieldClasses } from "@/components/ui/action-form";
import { ChevronDownIcon } from "@/components/ui/icons";
import { pcoLinkStatus, type LinkRowGroup } from "@/lib/domain/pco-links";
import { setLinkAction } from "./actions";

const idle: FormState = { status: "idle" };

type Role = { id: string; name: string; departmentName: string };
const roleLabel = (role: Role) => `${role.name} (${role.departmentName})`;

/** The page's sections, as tabs. Every section is drawn by the server and only shown or hidden here. */
export function PcoTabs({
  tabs,
}: {
  tabs: { id: string; label: string; count?: number; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="Planning Center sections"
        className="flex gap-0.5 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`min-h-control border-b-2 px-3 whitespace-nowrap ${
              active === tab.id
                ? "border-accent font-semibold text-text"
                : "border-transparent text-text-secondary hover:text-text"
            }`}
          >
            {tab.label}
            {tab.count ? (
              <span className="tabular ml-1 text-small font-normal text-text-muted">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

/**
 * One position's link, saved as soon as it's chosen. On a phone the whole row is the dropdown, so the
 * list stays compact and tapping opens the phone's own picker. The field is still full size, only
 * invisible, because iPhones zoom the page on anything smaller.
 */
export function PcoLinkRow({
  label,
  hint,
  team = false,
  row,
  roles,
}: {
  label: string;
  hint?: string;
  team?: boolean;
  row: LinkRowGroup;
  roles: Role[];
}) {
  const id = `link-${row.targets.map((t) => `${t.teamId}-${t.positionId ?? "team"}`).join("_")}`;
  const form = useRef<HTMLFormElement>(null);
  const [roleId, setRoleId] = useState(row.roleId ?? "");
  const [state, save, saving] = useActionState(setLinkAction, idle);
  const [lastState, setLastState] = useState(state);
  // A link that didn't save goes back to what it was.
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "error") {
      setRoleId(row.roleId ?? "");
    }
  }
  const status = pcoLinkStatus({ roleId: roleId || null, mixed: row.mixed }, team);
  const chosen = roles.find((role) => role.id === roleId);
  const message = saving ? "Saving…" : state.status === "done" ? "Saved" : null;

  return (
    <form
      ref={form}
      action={save}
      className={`relative grid grid-cols-[minmax(0,1fr)] gap-x-3 px-3.5 py-2 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent-light max-sm:min-h-13 max-sm:pr-9 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_6.5rem] sm:items-center sm:py-1.5 ${
        team ? "bg-card" : ""
      }`}
    >
      <input type="hidden" name="targets" value={JSON.stringify(row.targets)} />
      <div className="min-w-0">
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="block text-small text-text-muted max-sm:hidden">{hint}</span>
        ) : null}
        <span
          className={`block text-small sm:hidden ${
            status.tone === "warning" && !message ? "font-medium text-warning" : "text-text-muted"
          }`}
        >
          {message ?? (chosen ? roleLabel(chosen) : status.label)}
        </span>
      </div>
      <div className="min-w-0">
        <label htmlFor={id} className="sr-only">
          Academy position for {label}
        </label>
        <select
          id={id}
          name="roleId"
          value={roleId}
          onChange={(event) => {
            setRoleId(event.target.value);
            form.current?.requestSubmit();
          }}
          className={`${fieldClasses} w-full max-sm:absolute max-sm:inset-0 max-sm:size-full max-sm:cursor-pointer max-sm:opacity-0`}
        >
          <option value="">Not linked</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
      </div>
      <span
        className={`flex items-center gap-1.5 text-small max-sm:hidden ${
          status.tone === "warning" && !message
            ? "text-warning"
            : status.tone === "success" || message
              ? "text-success"
              : "text-text-muted"
        }`}
      >
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
        {message ?? status.label}
      </span>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted sm:hidden" />
      {/* The result, for screen readers on every screen, and an error for everyone. */}
      <span role="status" className="sr-only">
        {state.status === "done" ? state.message : ""}
      </span>
      {state.status === "error" ? (
        <p role="alert" className="col-span-full mt-1 text-small text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Everyone on a Planning Center team or schedule with no Academy account. Searchable, as it can be long. */
export function PcoPeople({ names, inviteHref }: { names: string[]; inviteHref: string | null }) {
  const [query, setQuery] = useState("");
  const shown = names.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="max-w-80 min-w-0 flex-[1_1_14rem]">
          <label htmlFor="pco-people-search" className="sr-only">
            Search names
          </label>
          <input
            id="pco-people-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            placeholder="Search names"
            className={`${fieldClasses} w-full`}
          />
        </div>
        {inviteHref ? (
          <Link
            href={inviteHref}
            className="inline-flex min-h-button items-center justify-center rounded-button bg-accent px-3 text-button font-medium whitespace-nowrap text-on-accent hover:brightness-110 max-sm:w-full"
          >
            Invite people
          </Link>
        ) : null}
      </div>
      {shown.length > 0 ? (
        <ul className="grid overflow-hidden rounded-card border border-border bg-surface sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((name, index) => (
            <li key={`${name}-${index}`} className="-mt-px border-t border-border px-3.5 py-1.5">
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted">Nobody matches.</p>
      )}
      <p className="text-small text-text-muted">
        On a Planning Center team or schedule, with no Academy account using one of their Planning
        Center emails. Invite them with the email they use there.
      </p>
    </div>
  );
}
