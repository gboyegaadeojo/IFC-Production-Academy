import type { ReactNode } from "react";
import {
  CalendarRangeIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  MessageIcon,
  UserCheckIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { NotificationKind } from "@/lib/domain/notifications";

const KIND_ICON: Record<
  NotificationKind,
  { icon: (p: { className?: string }) => ReactNode; tone: string }
> = {
  assignment_scheduled: { icon: CalendarRangeIcon, tone: "text-warning" },
  serving_reminder: { icon: CalendarRangeIcon, tone: "text-warning" },
  cover_requested: { icon: UsersIcon, tone: "text-warning" },
  schedule_update: { icon: CalendarRangeIcon, tone: "text-warning" },
  assessment_recorded: { icon: CheckIcon, tone: "text-success" },
  competency_expiring: { icon: ClockIcon, tone: "text-warning" },
  membership_approved: { icon: GraduationCapIcon, tone: "text-accent-light" },
  course_assigned: { icon: GraduationCapIcon, tone: "text-accent-light" },
  learning_nudge: { icon: GraduationCapIcon, tone: "text-accent-light" },
  mentoring_paired: { icon: UsersIcon, tone: "text-accent-light" },
  assessment_requested: { icon: UserCheckIcon, tone: "text-accent-light" },
  sop_review_due: { icon: FileTextIcon, tone: "text-text-secondary" },
  onboarding_task: { icon: UserCheckIcon, tone: "text-warning" },
  onboarding_update: { icon: UsersIcon, tone: "text-accent-light" },
  service_changed: { icon: CalendarRangeIcon, tone: "text-warning" },
  join_requested: { icon: UsersIcon, tone: "text-accent-light" },
  cover_open: { icon: UsersIcon, tone: "text-warning" },
  approved_to_serve: { icon: CheckIcon, tone: "text-success" },
  certificate_ready: { icon: CheckIcon, tone: "text-success" },
  new_course: { icon: GraduationCapIcon, tone: "text-accent-light" },
  sop_updated: { icon: FileTextIcon, tone: "text-text-secondary" },
  mentor_note: { icon: UsersIcon, tone: "text-accent-light" },
  role_granted: { icon: UserCheckIcon, tone: "text-success" },
  role_removed: { icon: UsersIcon, tone: "text-text-secondary" },
  membership_declined: { icon: UsersIcon, tone: "text-warning" },
  membership_removed: { icon: UsersIcon, tone: "text-warning" },
  skill_suspended: { icon: ClockIcon, tone: "text-warning" },
  certificate_withdrawn: { icon: FileTextIcon, tone: "text-warning" },
  quiz_attempt_granted: { icon: GraduationCapIcon, tone: "text-accent-light" },
  assignment_cancelled: { icon: CalendarRangeIcon, tone: "text-warning" },
  mentoring_ended: { icon: UsersIcon, tone: "text-text-secondary" },
  course_unassigned: { icon: GraduationCapIcon, tone: "text-text-secondary" },
  message: { icon: MessageIcon, tone: "text-accent-light" },
};

/** A round icon for what kind of notification it is: serving, training, leading. Decorative. */
export function NotificationIcon({
  kind,
  small = false,
}: {
  kind: NotificationKind;
  small?: boolean;
}) {
  const { icon: Icon, tone } = KIND_ICON[kind];
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-pill border border-border bg-card ${tone} ${
        small ? "size-8" : "size-9"
      }`}
    >
      <Icon className={small ? "size-3.5" : "size-4"} />
    </span>
  );
}
