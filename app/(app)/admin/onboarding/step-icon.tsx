import type { ReactNode } from "react";
import {
  BellIcon,
  CalendarRangeIcon,
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListChecksIcon,
  UserIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { StepKind } from "@/lib/domain/onboarding";

/** Same stroke family as components/ui/icons (DESIGN §4.4); decorative. */
function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const MailIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Svg>
);
const BranchIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="8" r="2.5" />
    <path d="M6 8.5v7M6 15c0-4 7-4 10-6" />
  </Svg>
);
const FlagIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M4 22V4M4 4h12l-2 4 2 4H4" />
  </Svg>
);
const RefreshIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
  </Svg>
);

const ICONS: Record<StepKind, (props: { className?: string }) => ReactNode> = {
  trigger_form: FileTextIcon,
  trigger_manual: UserIcon,
  trigger_join: UsersIcon,
  trigger_pco: RefreshIcon,
  email: MailIcon,
  notify: BellIcon,
  task: ListChecksIcon,
  mentor: UsersIcon,
  course: GraduationCapIcon,
  wait: ClockIcon,
  pco_team: CalendarRangeIcon,
  branch: BranchIcon,
  finish: FlagIcon,
};

export function StepIcon({ kind, className }: { kind: StepKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} />;
}
