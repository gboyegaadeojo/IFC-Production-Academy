import type { Metadata } from "next";
import Link from "next/link";
import { HelpSearch } from "@/components/help/help-search";
import { HELP_PAGES } from "@/lib/domain/help";
import { HELP_CONTENT } from "@/lib/generated/help-content";

export const metadata: Metadata = { title: "Help and guides" };

/** Every guide, open to anyone, signed in or not (ADD-HELP-01). */
export default function HelpPage() {
  return (
    <div className="page-container flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Help and guides</h1>
        <p className="text-text-secondary">
          How each part of the app works, in plain words. New here? Start with{" "}
          <Link href="/help/getting-started" className="text-accent-light underline">
            Getting started
          </Link>
          .
        </p>
      </header>
      <HelpSearch
        entries={HELP_PAGES.map((page) => ({
          slug: page.slug,
          title: page.title,
          summary: page.summary,
          section: page.section,
          words: `${page.title} ${page.summary} ${HELP_CONTENT[page.slug] ?? ""}`.toLowerCase(),
        }))}
      />
    </div>
  );
}
