import Link from "next/link";
import { helpLinkTarget } from "@/lib/domain/help";
import type { Block, Inline, ListItem } from "@/lib/domain/markdown";

function InlineParts({ parts, source }: { parts: Inline[]; source: string }) {
  return (
    <>
      {parts.map((part, index) => {
        switch (part.kind) {
          case "text":
            return <span key={index}>{part.text}</span>;
          case "strong":
            return (
              <strong key={index} className="font-semibold text-text">
                <InlineParts parts={part.children} source={source} />
              </strong>
            );
          case "em":
            return (
              <em key={index}>
                <InlineParts parts={part.children} source={source} />
              </em>
            );
          case "underline":
            return (
              <u key={index}>
                <InlineParts parts={part.children} source={source} />
              </u>
            );
          case "code":
            return (
              <code key={index} className="rounded-sm bg-hover px-1 font-mono text-[0.92em]">
                {part.text}
              </code>
            );
          case "link": {
            const target = helpLinkTarget(part.href, source);
            const children = <InlineParts parts={part.children} source={source} />;
            if (!target) {
              return <span key={index}>{children}</span>;
            }
            return target.startsWith("https://") ? (
              <a
                key={index}
                href={target}
                target="_blank"
                rel="noreferrer"
                className="text-accent-light underline"
              >
                {children}
              </a>
            ) : (
              <Link key={index} href={target} className="text-accent-light underline">
                {children}
              </Link>
            );
          }
        }
      })}
    </>
  );
}

function ListBlock({
  ordered,
  items,
  source,
}: {
  ordered: boolean;
  items: ListItem[];
  source: string;
}) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`flex flex-col gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((item, index) => (
        <li key={index}>
          <InlineParts parts={item.content} source={source} />
          {item.children ? <GuideBlock block={item.children} source={source} /> : null}
        </li>
      ))}
    </Tag>
  );
}

export function GuideBlock({ block, source }: { block: Block; source: string }) {
  switch (block.kind) {
    case "heading":
      if (block.level === 1) {
        return (
          <h1 id={block.id} className="text-title font-semibold text-balance text-text">
            {block.text}
          </h1>
        );
      }
      return block.level === 2 ? (
        <h2 id={block.id} className="mt-3 scroll-mt-20 text-heading font-semibold text-text">
          {block.text}
        </h2>
      ) : (
        <h3 id={block.id} className="mt-1 scroll-mt-20 font-semibold text-text">
          {block.text}
        </h3>
      );
    case "paragraph":
      return (
        <p>
          <InlineParts parts={block.content} source={source} />
        </p>
      );
    case "note":
      return (
        <p className="rounded-button border border-warning-line bg-warning-soft px-3 py-2 text-text">
          <strong className="font-semibold">Careful: </strong>
          <InlineParts parts={block.content} source={source} />
        </p>
      );
    case "list":
      return <ListBlock ordered={block.ordered} items={block.items} source={source} />;
    case "code":
      return (
        <pre
          tabIndex={0}
          className="overflow-x-auto rounded-button border border-border bg-card p-3 font-mono text-small"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "table":
      return (
        <div tabIndex={0} className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-small">
            <thead className="bg-card text-left">
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index} className="px-3 py-2 font-semibold text-text">
                    <InlineParts parts={cell} source={source} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border align-top">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2">
                      <InlineParts parts={cell} source={source} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** A guide, drawn from plain data, so nothing in one can run as HTML. */
export function GuideContent({ blocks, source }: { blocks: Block[]; source: string }) {
  return (
    <article className="flex flex-col gap-3 text-text-secondary">
      {blocks.map((block, index) => (
        <GuideBlock key={index} block={block} source={source} />
      ))}
    </article>
  );
}
