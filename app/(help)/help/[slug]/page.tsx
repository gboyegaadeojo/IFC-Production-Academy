import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideContent } from "@/components/help/guide-content";
import { HELP_PAGES, helpPage } from "@/lib/domain/help";
import { parseMarkdown } from "@/lib/domain/markdown";
import { HELP_CONTENT } from "@/lib/generated/help-content";

export function generateStaticParams() {
  return HELP_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const page = helpPage((await params).slug);
  return { title: page?.title ?? "Help and guides" };
}

/** One guide (ADD-HELP-01). Open to anyone: guides hold no one's data, and no secrets. */
export default async function GuidePage({ params }: PageProps<"/help/[slug]">) {
  const page = helpPage((await params).slug);
  const source = page ? HELP_CONTENT[page.slug] : undefined;
  if (!page || source === undefined) {
    notFound();
  }
  return (
    <div className="page-container flex flex-col gap-4 py-8">
      <div className="flex max-w-3xl flex-col gap-4">
        <Link href="/help" className="text-small text-accent-light underline">
          All help and guides
        </Link>
        <GuideContent blocks={parseMarkdown(source)} source={page.source} />
      </div>
    </div>
  );
}
