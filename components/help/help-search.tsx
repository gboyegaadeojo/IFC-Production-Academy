"use client";

import Link from "next/link";
import { useState } from "react";
import { fieldClasses } from "@/components/ui/action-form";
import { HELP_SECTIONS, type HelpSection } from "@/lib/domain/help";

export type HelpEntry = {
  slug: string;
  title: string;
  summary: string;
  section: HelpSection;
  words: string;
};

/** Every guide, by who it's for, with a search across their words. */
export function HelpSearch({ entries }: { entries: HelpEntry[] }) {
  const [query, setQuery] = useState("");
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = entries.filter((entry) => terms.every((term) => entry.words.includes(term)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-1">
        <label htmlFor="help-search" className="text-small font-medium text-text-secondary">
          Search the guides
        </label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={fieldClasses}
        />
        <p role="status" className="min-h-5 text-small text-text-muted">
          {terms.length > 0
            ? found.length === 0
              ? "Nothing matches. Try other words."
              : `${found.length} ${found.length === 1 ? "guide" : "guides"} found`
            : null}
        </p>
      </div>
      {HELP_SECTIONS.map((section) => {
        const pages = found.filter((entry) => entry.section === section);
        const headingId = `help-${section.toLowerCase().replaceAll(" ", "-")}`;
        return pages.length === 0 ? null : (
          <section key={section} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className="text-heading font-semibold">
              {section}
            </h2>
            <ul className="grid gap-2 md:grid-cols-2">
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/help/${page.slug}`}
                    className="flex h-full flex-col gap-0.5 rounded-card border border-border bg-surface p-3 transition-surface hover:bg-hover"
                  >
                    <span className="font-medium">{page.title}</span>
                    <span className="text-small text-text-secondary">{page.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
