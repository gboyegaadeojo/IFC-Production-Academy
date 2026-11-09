"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * On a phone, once the next-step card has scrolled away, a slim bar above the tabs keeps
 * Continue one tap away (department page D, 2026-11-07). It hides again when the card is back.
 */
export function StickyContinue({
  watchId,
  href,
  title,
  label,
}: {
  /** The next-step card's id. */
  watchId: string;
  href: string;
  title: string;
  label: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const card = document.getElementById(watchId);
    if (!card) return;
    const observer = new IntersectionObserver(([entry]) => {
      // Only once it has gone off the top, not before it has scrolled into view.
      if (entry) setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, [watchId]);

  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-(--tab-bar-space) z-20 border-t border-border bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden print:hidden">
      <Link
        href={href}
        className="flex min-h-12 items-center justify-between gap-3 rounded-pill bg-text py-1.5 pr-1.5 pl-5 text-bg"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[0.6875rem] font-semibold tracking-wide uppercase opacity-70">
            Up next
          </span>
          <span className="truncate text-small font-semibold">{title}</span>
        </span>
        <span className="flex min-h-9 shrink-0 items-center rounded-pill bg-bg px-4 text-small font-semibold text-text">
          {label}
        </span>
      </Link>
    </div>
  );
}
