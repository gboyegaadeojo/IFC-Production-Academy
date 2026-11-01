import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MonthCalendar, type DayMark } from "@/components/ui/month-calendar";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getEventsBetween, type EventSummary } from "@/lib/data/schedule";
import {
  addDays,
  dayLabel,
  gridRange,
  parseDate,
  parseMonth,
  winnipegDate,
} from "@/lib/domain/month-calendar";
import { eventTimeLabel, winnipegToUtc } from "@/lib/domain/schedule";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { ScheduleTabs } from "../schedule-tabs";

export const metadata: Metadata = { title: "Schedule calendar" };

export default function ScheduleCalendarPage({
  searchParams,
}: PageProps<"/admin/schedule/calendar">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the calendar…" />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Every service in a month (decision record 9): tap a day to see its services and gaps. */
async function CalendarContent({
  searchParams,
}: Pick<PageProps<"/admin/schedule/calendar">, "searchParams">) {
  const { allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const params = await searchParams;
  const today = winnipegDate(new Date());
  const selected = parseDate(params.day);
  const month = parseMonth(params.month, (selected ?? today).slice(0, 7));
  const range = gridRange(month);
  const events = await getEventsBetween(
    (winnipegToUtc(range.from, "00:00") ?? new Date()).toISOString(),
    (winnipegToUtc(addDays(range.to, 1), "00:00") ?? new Date()).toISOString(),
  );

  const marks = new Map<string, DayMark[]>();
  for (const event of events) {
    if (event.cancelled) {
      continue;
    }
    const date = winnipegDate(event.startsAt);
    const open = event.positions - event.filled;
    marks.set(date, [
      ...(marks.get(date) ?? []),
      {
        label: open > 0 ? `${event.title}, ${open} open` : event.title,
        tone: open > 0 ? "pending" : "event",
      },
    ]);
  }
  const query = (next: { month: string; day?: string }) => {
    const search = new URLSearchParams({ month: next.month });
    if (next.day) {
      search.set("day", next.day);
    }
    return `/admin/schedule/calendar?${search.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        description="Every service this month. Tap a day to see who's serving and what's still open."
      />
      <ScheduleTabs current="calendar" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <MonthCalendar
          month={month}
          today={today}
          selected={selected}
          marks={marks}
          hrefFor={(date) => query({ month: date.slice(0, 7), day: date })}
          monthHref={(next) => query({ month: next })}
        />
        {selected ? (
          <DayEvents
            date={selected}
            events={events.filter((e) => winnipegDate(e.startsAt) === selected)}
          />
        ) : (
          <p className="text-small text-text-muted lg:pt-12">Tap a day to see its services.</p>
        )}
      </div>
    </div>
  );
}

function DayEvents({ date, events }: { date: string; events: EventSummary[] }) {
  return (
    <section
      aria-labelledby="day-heading"
      className="flex flex-col gap-3 rounded-card border border-border p-5 lg:mt-12"
    >
      <h2 id="day-heading" className="text-subheading font-semibold">
        {dayLabel(date)}
      </h2>
      {events.length === 0 ? (
        <p className="text-small text-text-secondary">No services this day.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/admin/schedule/${event.id}`}
                className="flex min-h-touch flex-col gap-1 px-3 py-2 hover:bg-card"
              >
                <span className="font-medium text-text">{event.title}</span>
                <span className="text-small text-text-muted">
                  {eventTimeLabel(event.startsAt, event.endsAt)}
                </span>
                {event.cancelled ? (
                  <StatusBadge tone="neutral">Cancelled</StatusBadge>
                ) : (
                  <StatusBadge
                    tone={
                      event.positions > 0 && event.filled === event.positions
                        ? "success"
                        : "pending"
                    }
                  >
                    {event.positions === 0
                      ? "No positions yet"
                      : `${event.filled} of ${event.positions} filled`}
                  </StatusBadge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
