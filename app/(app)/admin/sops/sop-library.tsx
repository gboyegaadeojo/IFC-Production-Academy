"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ALL_PRODUCTION_LABEL,
  ALL_PRODUCTION_VALUE,
  groupSopsByCategory,
  matchesSearch,
  NO_CATEGORY_LABEL,
  SOP_STATE_LABELS,
  sopCategories,
  type SopState,
} from "@/lib/domain/sops";
import { createSopAction } from "./actions";

export type SopLibraryRow = {
  id: string;
  title: string;
  audience: string;
  audienceValue: string;
  /** A department's colour. Null for all of production, which has none. */
  hue: string | null;
  category: string;
  owner: string | null;
  versionNumber: number | null;
  reviewed: string | null;
  state: SopState;
  hasDraftChanges: boolean;
};

type StatusFilter = "active" | SopState;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "All except archived" },
  { value: "review_due", label: SOP_STATE_LABELS.review_due },
  { value: "current", label: SOP_STATE_LABELS.current },
  { value: "not_published", label: SOP_STATE_LABELS.not_published },
  { value: "archived", label: SOP_STATE_LABELS.archived },
];
const NEW_CATEGORY = "__new";
const COLUMNS = "md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_6rem_8rem] md:gap-3";

/** The SOP library for the people who look after it (decision 2026-11-03-sop-library). */
export function SopLibrary({
  rows,
  addTo,
  audiences,
}: {
  rows: SopLibraryRow[];
  addTo: { value: string; label: string }[];
  audiences: { id: string; name: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("any");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [category, setCategory] = useState("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const filtered = rows.filter(
    (row) =>
      (audience === "any" || row.audienceValue === audience) &&
      (status === "active" ? row.state !== "archived" : row.state === status) &&
      matchesSearch(
        { title: row.title, summary: `${row.audience} ${row.owner ?? ""}`, category: row.category },
        query,
      ),
  );
  const inCategory = (row: SopLibraryRow, name: string) =>
    (row.category || NO_CATEGORY_LABEL) === name;
  const shown = category === "all" ? filtered : filtered.filter((row) => inCategory(row, category));
  const due = rows.filter((row) => row.state === "review_due").length;
  const searching = query.trim() !== "";
  const clearFilters = () => {
    setQuery("");
    setAudience("any");
    setStatus("active");
    setCategory("all");
  };
  const toggle = (name: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(name)) {
        next.add(name);
      }
      return next;
    });
  const openAdd = () => dialog.current?.showModal();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_18rem]">
          <h1 className="text-title font-bold tracking-tight">SOP library</h1>
          <p className="mt-1 max-w-[64ch] text-text-secondary">
            Your team&apos;s written procedures, for one department or all of production. Keep each
            one current, and attach it to the lessons that use it.
          </p>
        </div>
        {addTo.length > 0 && rows.length > 0 ? (
          <Button onClick={openAdd} className="max-md:w-full">
            <span aria-hidden="true">+</span> Add SOP
          </Button>
        ) : null}
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong bg-surface px-5 py-12 text-center">
          <h2 className="text-subheading font-semibold">No SOPs yet</h2>
          <p className="mb-2 max-w-[48ch] text-text-secondary">
            {addTo.length > 0
              ? "Add your team's first procedure, such as how to start the stream or how to do a copyright review."
              : "SOPs for the departments you look after will show here."}
          </p>
          {addTo.length > 0 ? <Button onClick={openAdd}>Add your first SOP</Button> : null}
        </div>
      ) : (
        <>
          {due > 0 && status !== "review_due" ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-button border border-warning-line bg-warning-soft px-3 py-2">
              <span>
                <strong className="font-semibold">
                  {due === 1 ? "1 SOP is" : `${due} SOPs are`} due for review.
                </strong>{" "}
                Check each one is still right.
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatus("review_due");
                  setCategory("all");
                }}
                className="min-h-button font-semibold underline underline-offset-3"
              >
                Show {due === 1 ? "it" : "them"}
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_12rem_10rem]">
            <div className="col-span-2 md:col-span-1">
              <label htmlFor="sop-search" className="sr-only">
                Search SOPs
              </label>
              <input
                id="sop-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, category, or owner"
                className={`${fieldClasses} w-full`}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="sop-audience" className="sr-only">
                Who it&apos;s for
              </label>
              <select
                id="sop-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className={`${fieldClasses} w-full`}
              >
                <option value="any">Everyone and every department</option>
                <option value={ALL_PRODUCTION_VALUE}>{ALL_PRODUCTION_LABEL}</option>
                {audiences.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="sop-status" className="sr-only">
                Status
              </label>
              <select
                id="sop-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className={`${fieldClasses} w-full`}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
            <CategoryChip
              label="All categories"
              count={filtered.length}
              pressed={category === "all"}
              onClick={() => setCategory("all")}
            />
            {sopCategories(rows).map((name) => (
              <CategoryChip
                key={name}
                label={name}
                count={filtered.filter((row) => inCategory(row, name)).length}
                pressed={category === name}
                onClick={() => setCategory(name)}
              />
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong bg-surface px-5 py-8 text-center">
              <h2 className="text-subheading font-semibold">Nothing matches</h2>
              <p className="mb-2 text-text-secondary">Try another word, or clear the filters.</p>
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div
                aria-hidden="true"
                className={`hidden border-b border-border bg-card px-4 py-2 text-small font-semibold text-text-muted md:grid ${COLUMNS}`}
              >
                <span>SOP</span>
                <span>Who it&apos;s for</span>
                <span>Owner</span>
                <span>Reviewed</span>
                <span>Status</span>
              </div>
              {groupSopsByCategory(shown).map((group) => {
                // A search shows every match, even in a group that's collapsed.
                const open = searching || !collapsed.has(group.name);
                const groupDue = group.sops.filter((row) => row.state === "review_due").length;
                return (
                  <section key={group.name} className="border-border not-first-of-type:border-t">
                    <h2>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggle(group.name)}
                        className="flex min-h-button w-full items-center gap-2 bg-card px-4 py-2 text-left font-semibold hover:bg-hover"
                      >
                        <ChevronRightIcon
                          className={`size-3.5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
                        />
                        {group.name}
                        <span className="tabular text-small font-normal text-text-muted">
                          {group.sops.length}
                        </span>
                        {groupDue > 0 ? (
                          <span className="ml-auto font-normal">
                            <StatusBadge tone="pending">{groupDue} due</StatusBadge>
                          </span>
                        ) : null}
                      </button>
                    </h2>
                    {open ? (
                      <ul>
                        {group.sops.map((row) => (
                          <SopRow key={row.id} row={row} />
                        ))}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
          <p role="status" className="text-small text-text-muted">
            {shown.length} of {rows.length} SOPs
          </p>
        </>
      )}

      <AddSopDialog
        ref={dialog}
        addTo={addTo}
        categories={sopCategories(rows).filter((name) => name !== NO_CATEGORY_LABEL)}
      />
    </div>
  );
}

function CategoryChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-button-sm items-center gap-1.5 rounded-pill border px-2.5 text-small font-medium ${
        pressed
          ? "border-accent-light bg-accent-soft font-semibold text-accent-light"
          : "border-border-strong bg-surface text-text-secondary hover:bg-hover"
      }`}
    >
      {label}
      <span className="tabular opacity-80">{count}</span>
    </button>
  );
}

function SopRow({ row }: { row: SopLibraryRow }) {
  return (
    <li
      className={`relative grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 transition-surface hover:bg-hover md:items-center ${COLUMNS}`}
    >
      <div className="col-span-2 flex flex-wrap gap-1 md:order-last md:col-span-1">
        <StatusBadge tone={row.state === "current" ? "success" : "pending"}>
          {SOP_STATE_LABELS[row.state]}
        </StatusBadge>
        {row.hasDraftChanges ? <StatusBadge tone="pending">Changes in a draft</StatusBadge> : null}
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <Link
          href={`/admin/sops/${row.id}`}
          className="font-semibold text-accent-light underline-offset-3 after:absolute after:inset-0 hover:underline"
        >
          {row.title}
        </Link>
        {row.versionNumber ? (
          <span className="block text-small text-text-muted">Version {row.versionNumber}</span>
        ) : null}
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-text-secondary md:col-span-1">
        {row.hue ? (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: row.hue }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full border-2 border-text-muted"
          />
        )}
        <span className="min-w-0 wrap-anywhere">{row.audience}</span>
      </div>
      <div className="min-w-0 wrap-anywhere text-text-secondary">
        <span className="text-text-muted md:hidden">Owner: </span>
        {row.owner ?? "No owner yet"}
      </div>
      <div className="tabular text-text-secondary">
        <span className="text-text-muted md:hidden">Reviewed: </span>
        {row.reviewed ?? "Not yet"}
      </div>
    </li>
  );
}

function AddSopDialog({
  ref,
  addTo,
  categories,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  addTo: { value: string; label: string }[];
  categories: string[];
}) {
  const [choice, setChoice] = useState("");
  const headingId = useId();
  const canAddAllProduction = addTo.some((option) => option.value === ALL_PRODUCTION_VALUE);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className="backdrop:bg-black/50 m-auto w-[min(27.5rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-5 text-text [box-shadow:var(--shadow-lift)]"
    >
      <div className="flex flex-col gap-3">
        <h2 id={headingId} className="text-subheading font-semibold">
          Add an SOP
        </h2>
        <p className="text-small text-text-secondary">
          You&apos;ll write the procedure in the next step.
        </p>
        <ActionForm
          action={createSopAction}
          submitLabel="Create SOP"
          pendingLabel="Creating…"
          className="flex flex-col gap-3"
        >
          <Field id="new-sop-title" label="SOP title">
            <input
              id="new-sop-title"
              name="title"
              required
              maxLength={120}
              autoComplete="off"
              placeholder="For example, Copyright review"
              className={fieldClasses}
            />
          </Field>
          <Field
            id="new-sop-department"
            label="Who it's for"
            hint={
              canAddAllProduction
                ? "Choose All of production if it isn't about one department."
                : undefined
            }
          >
            <select
              id="new-sop-department"
              name="departmentId"
              defaultValue={addTo[0]?.value}
              aria-describedby={canAddAllProduction ? "new-sop-department-hint" : undefined}
              className={fieldClasses}
            >
              {addTo.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="new-sop-category-choice" label="Category">
            <select
              id="new-sop-category-choice"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              className={fieldClasses}
            >
              <option value="">No category</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>New category…</option>
            </select>
          </Field>
          {choice === NEW_CATEGORY ? (
            <Field id="new-sop-category" label="New category name">
              <input
                id="new-sop-category"
                name="category"
                required
                maxLength={60}
                autoComplete="off"
                placeholder="For example, Safety"
                className={fieldClasses}
              />
            </Field>
          ) : (
            <input type="hidden" name="category" value={choice} />
          )}
        </ActionForm>
        <form method="dialog" className="-mt-1 flex justify-end">
          <Button type="submit" variant="tertiary">
            Cancel
          </Button>
        </form>
      </div>
    </dialog>
  );
}
