"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { railPosition, type RailPosition } from "@/lib/domain/scroll-rail";

/**
 * A titled row that scrolls sideways (refinements mock, approved 2026-11-06). So people know there's
 * more, the next item peeks in, the far edge fades while more is hidden, dots show where you are,
 * and from 768px there are arrows. Children are the row's `<li>` items.
 */
export function ScrollRail({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** Beside the heading: a count or links. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const listId = useId();
  const ref = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<RailPosition>(() => railPosition(0, 0, 0));

  const measure = useCallback(() => {
    const list = ref.current;
    if (!list) return;
    setPosition(railPosition(list.scrollLeft, list.scrollWidth, list.clientWidth));
  }, []);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  function scroll(direction: 1 | -1) {
    const list = ref.current;
    if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({
      left: direction * list.clientWidth * 0.85,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  const more = position.pages > 1;
  const arrowClasses =
    "flex size-9 items-center justify-center rounded-pill border border-border bg-surface text-text transition-surface hover:bg-hover disabled:cursor-default disabled:text-text-muted disabled:opacity-50 disabled:hover:bg-surface";

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 id={id} className="text-subheading font-bold tracking-tight">
            {title}
          </h2>
          {aside}
        </div>
        {more ? (
          <div className="hidden shrink-0 gap-2 md:flex">
            <button
              type="button"
              aria-controls={listId}
              aria-label={`Scroll ${title} back`}
              disabled={position.start}
              onClick={() => scroll(-1)}
              className={arrowClasses}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-controls={listId}
              aria-label={`Scroll ${title} forward`}
              disabled={position.end}
              onClick={() => scroll(1)}
              className={arrowClasses}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative -mx-4 md:mx-0">
        <ul
          id={listId}
          ref={ref}
          onScroll={measure}
          className="flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden [&>li]:shrink-0 [&>li]:snap-start"
        >
          {children}
        </ul>
        {position.end ? null : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-bg to-transparent md:w-20"
          />
        )}
      </div>
      {more ? (
        <div aria-hidden="true" className="flex justify-center gap-1.5">
          {Array.from({ length: position.pages }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-pill transition-[width,background-color] duration-[var(--duration-base)] motion-reduce:transition-none ${
                index === position.page ? "w-4 bg-text" : "w-1.5 bg-border-strong"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
