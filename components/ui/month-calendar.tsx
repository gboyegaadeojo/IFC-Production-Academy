import Link from "next/link";
import { dayLabel, monthGrid, monthLabel, shiftMonth } from "@/lib/domain/month-calendar";

export type DayMark = {
  /** Short text shown in the day, such as "Serving" or a service name. */
  label: string;
  tone: "serving" | "pending" | "declined" | "away" | "event";
};

const WEEKDAYS = [
  ["S", "Sunday"],
  ["M", "Monday"],
  ["T", "Tuesday"],
  ["W", "Wednesday"],
  ["T", "Thursday"],
  ["F", "Friday"],
  ["S", "Saturday"],
] as const;

const DOT: Record<DayMark["tone"], string> = {
  serving: "bg-success",
  pending: "bg-warning",
  // Hollow: declined isn't a commitment.
  declined: "ring-[1.5px] ring-warning ring-inset",
  away: "bg-error",
  event: "bg-accent-light",
};

/**
 * A month as a grid of day links (decision record 9, stage 1). Tap a day to open it. Marks show
 * as a dot and short text, and every mark is in the link's accessible name, so colour is never
 * the only signal. Works without JavaScript.
 */
export function MonthCalendar({
  month,
  today,
  selected,
  marks,
  hrefFor,
  monthHref,
  variant = "compact",
  showNav = true,
}: {
  month: string;
  today: string;
  selected: string | null;
  marks: ReadonlyMap<string, DayMark[]>;
  hrefFor: (date: string) => string;
  monthHref: (month: string) => string;
  /** "board": large bordered day cells (the Schedule page, redesigned 2026-11-01). */
  variant?: "compact" | "board";
  /** The month and its arrows; off where the page shows them itself. */
  showNav?: boolean;
}) {
  const weeks = monthGrid(month);
  const board = variant === "board";
  return (
    <div className="flex flex-col gap-3">
      <div className={showNav ? "flex items-center justify-between gap-3" : "sr-only"}>
        <h2 className="text-heading font-semibold" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <nav aria-label="Change month" className="flex gap-1">
          <CalendarNav href={monthHref(shiftMonth(month, -1))} label="Previous month">
            ‹
          </CalendarNav>
          <CalendarNav href={monthHref(today.slice(0, 7))}>Today</CalendarNav>
          <CalendarNav href={monthHref(shiftMonth(month, 1))} label="Next month">
            ›
          </CalendarNav>
        </nav>
      </div>
      <div className={board ? "overflow-hidden rounded-card border border-border" : ""}>
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">{monthLabel(month)}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map(([short, long], index) => (
                <th
                  key={index}
                  scope="col"
                  abbr={long}
                  className={
                    board
                      ? "border-b border-border py-3 text-center font-mono text-[0.7rem] font-medium tracking-[0.12em] text-text-muted"
                      : "pb-2 text-center text-small font-medium text-text-muted"
                  }
                >
                  {board ? long.slice(0, 3).toUpperCase() : short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((date) => {
                  const dayMarks = marks.get(date) ?? [];
                  const inMonth = date.startsWith(month);
                  const isSelected = date === selected;
                  const isToday = date === today;
                  // Named by its content, not an aria-label, so what's seen is what's announced.
                  const day = [dayLabel(date), isToday ? "today" : null].filter(Boolean).join(", ");
                  return (
                    <td
                      key={date}
                      className={
                        board
                          ? "border-r border-b border-border p-0 align-top last:border-r-0 [tr:last-child_&]:border-b-0"
                          : "p-0.5 align-top"
                      }
                    >
                      <Link
                        href={hrefFor(date)}
                        aria-current={isSelected ? "date" : undefined}
                        scroll={false}
                        className={
                          board
                            ? `flex min-h-14 flex-col items-center gap-1.5 bg-surface px-1 py-2 text-small transition-surface sm:min-h-24 sm:items-start sm:px-3 sm:py-2.5 ${
                                isSelected
                                  ? "relative z-10 rounded-button bg-card ring-[1.5px] ring-accent-light ring-inset"
                                  : "hover:bg-card"
                              } ${inMonth ? "text-text" : "text-text-muted/50"}`
                            : `flex min-h-14 flex-col items-center gap-1 rounded-button border px-0.5 py-1.5 text-small transition-surface sm:min-h-20 sm:items-start sm:px-2 ${
                                isSelected
                                  ? "border-accent-light bg-hover"
                                  : "border-transparent hover:border-border hover:bg-card"
                              } ${inMonth ? "text-text" : "text-text-muted"}`
                        }
                      >
                        <span className="sr-only">{day}</span>
                        <span
                          aria-hidden="true"
                          className={`tabular flex items-center justify-center rounded-pill ${
                            board
                              ? `size-7 text-body font-semibold sm:-ml-1 sm:text-[1.05rem] ${inMonth ? "" : "font-medium"}`
                              : "size-6 font-mono"
                          } ${isToday ? "bg-accent font-semibold text-on-accent" : ""}`}
                        >
                          {Number(date.slice(8))}
                        </span>
                        {dayMarks.length > 0 ? (
                          <span className="flex flex-col items-center gap-1 sm:w-full sm:items-stretch">
                            {dayMarks.slice(0, 3).map((mark, index) => (
                              // The dot sits on the label's first line, so wrapped labels stay
                              // aligned under each other.
                              <span
                                key={index}
                                className="flex items-center sm:grid sm:grid-cols-[0.375rem_minmax(0,1fr)] sm:items-start sm:gap-x-1.5"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`size-1.5 shrink-0 rounded-pill sm:mt-[0.4375rem] ${DOT[mark.tone]}`}
                                />
                                <span className="sr-only">, </span>
                                <span className="sr-only text-left text-[0.75rem] leading-[1.35] break-words text-text-secondary sm:not-sr-only sm:line-clamp-2">
                                  {mark.label}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalendarNav({
  href,
  label,
  children,
}: {
  href: string;
  /** Only for symbols; visible words name the link themselves. */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      scroll={false}
      className="flex min-h-control min-w-11 items-center justify-center rounded-button border border-border px-3 text-small text-text-secondary hover:border-border-strong hover:text-text"
    >
      {children}
    </Link>
  );
}
