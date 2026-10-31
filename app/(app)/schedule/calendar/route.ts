import { getCurrentUser } from "@/lib/data/auth";
import { getMyUpcomingAssignments } from "@/lib/data/schedule";
import { buildCalendar } from "@/lib/domain/calendar";

// The signed-in volunteer's upcoming serving as a calendar file (SPEC §9 Phase 5 "calendar").
// Declined assignments are left out; pending ones are marked tentative. Never cached.

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const assignments = (await getMyUpcomingAssignments(user.id)).filter(
    (a) => a.status === "pending" || a.status === "confirmed",
  );
  const ics = buildCalendar(
    assignments.map((a) => ({
      uid: a.id,
      title: `${a.roleName}, ${a.event.title}`,
      description: `${a.departmentName}. ${a.status === "confirmed" ? "Confirmed" : "Please confirm in the Academy"}.`,
      location: a.event.location,
      startsAt: a.event.startsAt,
      endsAt: a.event.endsAt,
      confirmed: a.status === "confirmed",
    })),
    new Date().toISOString(),
  );
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ifc-serving-schedule.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
