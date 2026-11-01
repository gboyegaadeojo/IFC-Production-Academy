import { Tabs } from "@/components/ui/tabs";
import { getSchedulingSource } from "@/lib/data/planning-center";

export type ScheduleView = "upcoming" | "calendar" | "matrix" | "types";

/**
 * The scheduler's views (decision record 9): a list, a calendar, the Matrix, and service types.
 * While Planning Center schedules, only the list and the calendar show: the rest happen there.
 */
export async function ScheduleTabs({ current }: { current: ScheduleView }) {
  const academy = (await getSchedulingSource()) === "academy";
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        label="Schedule views"
        tabs={[
          { href: "/admin/schedule", label: "Coming up", current: current === "upcoming" },
          { href: "/admin/schedule/calendar", label: "Calendar", current: current === "calendar" },
          ...(academy || current === "matrix"
            ? [{ href: "/admin/schedule/matrix", label: "Matrix", current: current === "matrix" }]
            : []),
          ...(academy || current === "types"
            ? [
                {
                  href: "/admin/schedule/types",
                  label: "Service types",
                  current: current === "types",
                },
              ]
            : []),
        ]}
      />
      {academy ? null : (
        <p className="max-w-3xl text-small text-text-secondary">
          Planning Center schedules. This shows what it reads from there every 15 minutes. Schedule
          people, and change services, in Planning Center.
        </p>
      )}
    </div>
  );
}
