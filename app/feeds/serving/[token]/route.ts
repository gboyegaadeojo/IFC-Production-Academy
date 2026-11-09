import { readCalendarFeed } from "@/lib/data/calendar-feed";
import { buildCalendar } from "@/lib/domain/calendar";
import { feedToken } from "@/lib/domain/service-files";

// A volunteer's serving as a calendar Google, Apple, or Outlook Calendar subscribes to (plan
// "Academy scheduling", PR 10). Calendar apps can't sign in, so the private link is the key; a
// link that isn't valid (or was replaced) gets an empty calendar, never an error that says which.
// Never cached.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const token = feedToken((await params).token);
  const entries = token ? await readCalendarFeed(token) : [];
  const ics = buildCalendar(
    entries.map((entry) => ({
      uid: entry.assignmentId,
      title: `${entry.roleName}, ${entry.title}`,
      description: `${entry.departmentName}. ${entry.confirmed ? "Confirmed" : "Please confirm in the Academy"}.`,
      location: entry.location,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      confirmed: entry.confirmed,
    })),
    new Date().toISOString(),
  );
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
