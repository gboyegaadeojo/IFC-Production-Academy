"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ALL_PRODUCTION_LABEL,
  ALL_PRODUCTION_VALUE,
  highlightParts,
  matchesSearch,
  NO_CATEGORY_LABEL,
  recentlyUpdated,
  SOP_STATE_LABELS,
  sopCategories,
  type SopState,
} from "@/lib/domain/sops";

export type SopBrowserRow = {
  id: string;
  title: string;
  summary: string;
  audience: string;
  audienceValue: string;
  /** A department's colour. Null for all of production, which has none. */
  hue: string | null;
  category: string;
  reviewed: string | null;
  publishedAt: string | null;
  state: SopState;
};

const ALL = "__all";
const RECENT = "__recent";
const ANY = "__any";
const PREVIEW_COUNT = 4;
const ROW_COLUMNS = "md:grid-cols-[minmax(0,1fr)_12rem_5.5rem] md:gap-3";

const categoryOf = (row: SopBrowserRow) => row.category || NO_CATEGORY_LABEL;

/** Browse and search the library, built to stay usable at 100 SOPs (decision 2026-11-03-sop-library). */
export function SopBrowser({
  rows,
  departments,
}: {
  rows: SopBrowserRow[];
  departments: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState(ANY);
  const [view, setView] = useState(ALL);

  const found = rows.filter(
    (row) =>
      (audience === ANY || row.audienceValue === audience) &&
      matchesSearch(
        { title: row.title, summary: `${row.summary} ${row.audience}`, category: row.category },
        query,
      ),
  );
  const categories = sopCategories(rows);
  const countIn = (name: string) => found.filter((row) => categoryOf(row) === name).length;
  const hasAllProduction = rows.some((row) => row.audienceValue === ALL_PRODUCTION_VALUE);
  const showAudience = departments.length + (hasAllProduction ? 1 : 0) > 1;
  const searching = query.trim() !== "";
  const inView =
    view === ALL || view === RECENT ? found : found.filter((row) => categoryOf(row) === view);
  const byTitle = (list: SopBrowserRow[]) =>
    list.toSorted((a, b) => a.title.localeCompare(b.title));
  const clear = () => {
    setQuery("");
    setAudience(ANY);
    setView(ALL);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_13rem]">
        <div className={showAudience ? "col-span-2 md:col-span-1" : "col-span-2"}>
          <label htmlFor="sop-search" className="sr-only">
            Search SOPs
          </label>
          <input
            id="sop-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            autoComplete="off"
            placeholder={`Search all ${rows.length} ${rows.length === 1 ? "SOP" : "SOPs"}`}
            className={`${fieldClasses} w-full`}
          />
        </div>
        {showAudience ? (
          <div className="min-w-0">
            <label htmlFor="sop-department" className="sr-only">
              Who it&apos;s for
            </label>
            <select
              id="sop-department"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className={`${fieldClasses} w-full`}
            >
              <option value={ANY}>All departments</option>
              {hasAllProduction ? (
                <option value={ALL_PRODUCTION_VALUE}>{ALL_PRODUCTION_LABEL}</option>
              ) : null}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={showAudience ? "min-w-0 md:hidden" : "col-span-2 md:hidden"}>
          <label htmlFor="sop-category" className="sr-only">
            Category
          </label>
          <select
            id="sop-category"
            value={view}
            onChange={(event) => setView(event.target.value)}
            className={`${fieldClasses} w-full`}
          >
            <option value={ALL}>All categories ({found.length})</option>
            <option value={RECENT}>Recently updated</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name} ({countIn(name)})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)] md:items-start">
        <nav aria-label="Browse SOPs" className="hidden flex-col gap-px md:flex">
          <RailButton
            label="All SOPs"
            count={found.length}
            pressed={view === ALL}
            onClick={() => setView(ALL)}
          />
          <RailButton
            label="Recently updated"
            pressed={view === RECENT}
            onClick={() => setView(RECENT)}
          />
          <h2 className="px-2.5 pt-2.5 pb-1 text-small font-semibold text-text-muted">
            Categories
          </h2>
          {categories.map((name) => (
            <RailButton
              key={name}
              label={name}
              count={countIn(name)}
              pressed={view === name}
              disabled={countIn(name) === 0}
              onClick={() => setView(name)}
            />
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-3.5">
          <p role="status" className={searching ? "text-small text-text-muted" : "sr-only"}>
            {inView.length === 1 ? "1 SOP matches." : `${inView.length} SOPs match.`}
          </p>
          {inView.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong bg-surface px-5 py-8 text-center">
              <h2 className="text-subheading font-semibold">Nothing matches</h2>
              <p className="mb-2 text-text-secondary">
                Try another word, or look in all categories.
              </p>
              <Button variant="secondary" onClick={clear}>
                Clear the search and filters
              </Button>
            </div>
          ) : view === RECENT ? (
            <SopGroup name="Recently updated">
              {recentlyUpdated(inView).map((row) => (
                <SopRow key={row.id} row={row} query={query} showCategory />
              ))}
            </SopGroup>
          ) : searching ? (
            <SopGroup>
              {byTitle(inView).map((row) => (
                <SopRow key={row.id} row={row} query={query} showCategory />
              ))}
            </SopGroup>
          ) : view === ALL ? (
            categories.flatMap((name) => {
              const list = byTitle(inView.filter((row) => categoryOf(row) === name));
              if (list.length === 0) {
                return [];
              }
              return [
                <SopGroup
                  key={name}
                  name={name}
                  count={list.length}
                  onSeeAll={list.length > PREVIEW_COUNT ? () => setView(name) : undefined}
                >
                  {list.slice(0, PREVIEW_COUNT).map((row) => (
                    <SopRow key={row.id} row={row} query="" />
                  ))}
                </SopGroup>,
              ];
            })
          ) : (
            <SopGroup name={view} count={inView.length}>
              {byTitle(inView).map((row) => (
                <SopRow key={row.id} row={row} query="" />
              ))}
            </SopGroup>
          )}
        </div>
      </div>
    </div>
  );
}

function RailButton({
  label,
  count,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-baseline justify-between gap-2.5 rounded-button px-2.5 py-1.5 text-left disabled:cursor-default disabled:opacity-50 ${
        pressed
          ? "bg-accent-soft font-semibold text-accent-light"
          : "text-text-secondary enabled:hover:bg-hover"
      }`}
    >
      <span className="min-w-0 wrap-anywhere">{label}</span>
      {count === undefined ? null : (
        <span className={`tabular text-small ${pressed ? "" : "text-text-muted"}`}>{count}</span>
      )}
    </button>
  );
}

function SopGroup({
  name,
  count,
  onSeeAll,
  children,
}: {
  name?: string;
  count?: number;
  onSeeAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={name ?? "Search results"}
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      {name ? (
        <header className="flex items-baseline gap-2 border-b border-border bg-card px-3.5 py-2">
          <h2 className="font-semibold">{name}</h2>
          {count === undefined ? null : (
            <span className="tabular text-small text-text-muted">{count}</span>
          )}
          {onSeeAll ? (
            <button
              type="button"
              onClick={onSeeAll}
              className="ml-auto text-small font-medium text-accent-light underline-offset-3 hover:underline"
            >
              See all {count}
              <span className="sr-only"> in {name}</span>
            </button>
          ) : null}
        </header>
      ) : null}
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return highlightParts(text, query).map((part, index) =>
    part.match ? (
      <mark key={index} className="rounded-[2px] bg-warning-soft text-inherit">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

function SopRow({
  row,
  query,
  showCategory,
}: {
  row: SopBrowserRow;
  query: string;
  showCategory?: boolean;
}) {
  return (
    <li
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 px-3.5 py-2 transition-surface hover:bg-hover md:items-center ${ROW_COLUMNS}`}
    >
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 md:col-span-1">
        <Link
          href={`/sops/${row.id}`}
          className="font-medium text-text after:absolute after:inset-0 hover:text-accent-light"
        >
          <Highlighted text={row.title} query={query} />
        </Link>
        {row.state === "review_due" ? (
          <StatusBadge tone="pending">{SOP_STATE_LABELS.review_due}</StatusBadge>
        ) : null}
        {showCategory ? (
          <span className="w-full text-small text-text-muted">
            <Highlighted text={row.category || NO_CATEGORY_LABEL} query={query} />
          </span>
        ) : null}
      </div>
      <span className="flex min-w-0 items-center gap-1.5 text-small text-text-secondary">
        {row.hue ? (
          <span
            aria-hidden="true"
            className="size-[7px] shrink-0 rounded-full"
            style={{ background: row.hue }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="size-[7px] shrink-0 rounded-full border-2 border-text-muted"
          />
        )}
        <span className="min-w-0 wrap-anywhere">{row.audience}</span>
      </span>
      <span className="tabular text-right text-small text-text-muted">
        <span className="sr-only">Reviewed </span>
        {row.reviewed ?? "Not yet"}
      </span>
    </li>
  );
}
