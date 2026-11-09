import { Tabs } from "@/components/ui/tabs";
import { getSchedulingSource } from "@/lib/data/planning-center";

export type ScheduleView = "upcoming" | "calendar" | "matrix" | "types" | "templates";

/**
 * The scheduler's views (decision record 9): a list, a calendar, the Matrix, service types, and
 * plan templates.
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
          ...(academy || current === "templates"
            ? [
                {
                  href: "/admin/schedule/templates",
                  label: "Plan templates",
                  current: current === "templates",
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
