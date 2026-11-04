import { GuideBlock } from "@/components/help/guide-content";
import { parseMarkdown } from "@/lib/domain/markdown";
import { underPageTitle } from "@/lib/domain/rich-text";

/** Course and lesson text as written in the editor (SRS-CUR-016). Links open only https pages. */
export function RichText({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {underPageTitle(parseMarkdown(source)).map((block, index) => (
        <GuideBlock key={index} block={block} source="" />
      ))}
    </div>
  );
}
