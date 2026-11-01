import { Tabs } from "@/components/ui/tabs";

export type ScheduleView = "upcoming" | "calendar" | "matrix" | "types";

/** The scheduler's views (decision record 9): a list, a calendar, the Matrix, and service types. */
export function ScheduleTabs({ current }: { current: ScheduleView }) {
  return (
    <Tabs
      label="Schedule views"
      tabs={[
        { href: "/admin/schedule", label: "Coming up", current: current === "upcoming" },
        { href: "/admin/schedule/calendar", label: "Calendar", current: current === "calendar" },
        { href: "/admin/schedule/matrix", label: "Matrix", current: current === "matrix" },
        { href: "/admin/schedule/types", label: "Service types", current: current === "types" },
      ]}
    />
  );
}
