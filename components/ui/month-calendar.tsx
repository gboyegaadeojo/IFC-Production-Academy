import Link from "next/link";
import { dayLabel, monthGrid, monthLabel, shiftMonth } from "@/lib/domain/month-calendar";

export type DayMark = {
  /** Short text shown in the day, such as "Serving" or a service name. */
  label: string;
  tone: "serving" | "pending" | "away" | "event";
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
}: {
  month: string;
  today: string;
  selected: string | null;
  marks: ReadonlyMap<string, DayMark[]>;
  hrefFor: (date: string) => string;
  monthHref: (month: string) => string;
}) {
  const weeks = monthGrid(month);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading font-semibold" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <nav aria-label="Change month" className="flex gap-1">
          <CalendarNav href={monthHref(shiftMonth(month, -1))} label="Previous month">
            ‹
          </CalendarNav>
          <CalendarNav href={monthHref(today.slice(0, 7))} label="This month">
            Today
          </CalendarNav>
          <CalendarNav href={monthHref(shiftMonth(month, 1))} label="Next month">
            ›
          </CalendarNav>
        </nav>
      </div>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{monthLabel(month)}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long], index) => (
              <th
                key={index}
                scope="col"
                abbr={long}
                className="pb-2 text-center text-small font-medium text-text-muted"
              >
                {short}
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
                const name = [
                  dayLabel(date),
                  isToday ? "today" : null,
                  ...dayMarks.map((mark) => mark.label),
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <td key={date} className="p-0.5 align-top">
                    <Link
                      href={hrefFor(date)}
                      aria-label={name}
                      aria-current={isSelected ? "date" : undefined}
                      scroll={false}
                      className={`flex min-h-14 flex-col items-center gap-1 rounded-button border px-0.5 py-1.5 text-small transition-surface sm:min-h-20 sm:items-start sm:px-2 ${
                        isSelected
                          ? "border-accent-light bg-hover"
                          : "border-transparent hover:border-border hover:bg-card"
                      } ${inMonth ? "text-text" : "text-text-muted"}`}
                    >
                      <span
                        className={`tabular flex size-6 items-center justify-center rounded-pill font-mono ${
                          isToday ? "bg-accent font-semibold text-on-accent" : ""
                        }`}
                      >
                        {Number(date.slice(8))}
                      </span>
                      {dayMarks.length > 0 ? (
                        <span className="flex flex-col items-center gap-0.5 sm:items-start">
                          {dayMarks.slice(0, 3).map((mark, index) => (
                            <span key={index} className="flex items-center gap-1">
                              <span
                                aria-hidden="true"
                                className={`size-1.5 shrink-0 rounded-pill ${DOT[mark.tone]}`}
                              />
                              <span className="hidden truncate text-small leading-tight text-text-secondary sm:inline">
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
  );
}

function CalendarNav({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
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
