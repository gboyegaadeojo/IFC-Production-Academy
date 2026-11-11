/**
 * Help and guides (ADD-HELP-01): the guides people read in the app, and which screens each one
 * explains. The words live in docs/guides and docs/runbooks, so there's one copy to keep current.
 * scripts/build-help.mjs bundles them, because a Worker can't read files. A test fails if a guide
 * is missing, or if a screen has no guide.
 */
import type { AdminSectionKey } from "./admin";

export const HELP_SECTIONS = ["Using the app", "For leaders", "Setting things up"] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

export type HelpPage = {
  slug: string;
  title: string;
  summary: string;
  section: HelpSection;
  /** The file it comes from, from the repository's root. */
  source: string;
  /** App paths this guide explains. The longest match wins. */
  paths?: string[];
  adminSections?: AdminSectionKey[];
};

export const HELP_PAGES: readonly HelpPage[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "Signing in, finding your way around, and putting it on your phone.",
    section: "Using the app",
    source: "docs/guides/getting-started.md",
    paths: ["/profile", "/notifications", "/get-the-app", "/serve-with-us"],
  },
  {
    slug: "training",
    title: "Training",
    summary: "Departments, courses, Explore, quizzes, practicals, and certificates.",
    section: "Using the app",
    source: "docs/guides/training.md",
    paths: ["/home", "/departments", "/courses", "/explore", "/videos", "/certificates"],
  },
  {
    slug: "schedule",
    title: "Schedule",
    summary: "When you're serving, who with, and adding it to your calendar.",
    section: "Using the app",
    source: "docs/guides/schedule.md",
    paths: ["/schedule"],
  },
  {
    slug: "checklist",
    title: "Checklist",
    summary: "What each position does before and after a service.",
    section: "Using the app",
    source: "docs/guides/checklist.md",
    paths: ["/serve"],
  },
  {
    slug: "sops",
    title: "SOPs",
    summary: "Finding and reading the team's procedures.",
    section: "Using the app",
    source: "docs/guides/sops.md",
    paths: ["/sops"],
  },
  {
    slug: "service-dashboard",
    title: "The Service Dashboard",
    summary: "One screen for the whole service, on computers and the wall TV.",
    section: "Using the app",
    source: "docs/guides/service-dashboard.md",
    paths: ["/service-dashboard", "/screen"],
    adminSections: ["branding"],
  },
  {
    slug: "messages",
    title: "Messages",
    summary: "Department chats, group chats, and direct messages.",
    section: "Using the app",
    source: "docs/guides/messages.md",
    paths: ["/messages"],
  },
  {
    slug: "mentoring",
    title: "Mentoring",
    summary: "Goals and notes between you and your mentor.",
    section: "Using the app",
    source: "docs/guides/mentoring.md",
    paths: ["/mentoring"],
  },
  {
    slug: "admin-overview",
    title: "Admin: start here",
    summary: "The Dashboard, who can do what, and where everything is.",
    section: "For leaders",
    source: "docs/guides/admin-overview.md",
    adminSections: ["overview", "features"],
  },
  {
    slug: "admin-people",
    title: "Admin: people and departments",
    summary: "Membership requests, invitations, roles, and departments.",
    section: "For leaders",
    source: "docs/guides/admin-people.md",
    adminSections: ["alerts", "members", "invitations", "people", "departments"],
  },
  {
    slug: "admin-curriculum",
    title: "Admin: curriculum",
    summary: "Building and publishing courses, lessons, quizzes, and practicals.",
    section: "For leaders",
    source: "docs/guides/admin-curriculum.md",
    adminSections: ["curriculum", "topics"],
  },
  {
    slug: "admin-sops",
    title: "Admin: SOP library",
    summary: "Adding, publishing, and reviewing procedures.",
    section: "For leaders",
    source: "docs/guides/admin-sops.md",
    adminSections: ["sops"],
  },
  {
    slug: "admin-assessments",
    title: "Admin: assessments and competencies",
    summary: "Watching practicals, competencies, and serving roles.",
    section: "For leaders",
    source: "docs/guides/admin-assessments.md",
    adminSections: ["assessments", "competencies"],
  },
  {
    slug: "admin-scheduling",
    title: "Admin: scheduling",
    summary: "Planning Center, serving teams, and the schedule.",
    section: "For leaders",
    source: "docs/guides/admin-scheduling.md",
    adminSections: ["planning-center", "teams", "schedule"],
  },
  {
    slug: "admin-checklists",
    title: "Admin: checklists",
    summary: "Task lists, the activity log, and service history.",
    section: "For leaders",
    source: "docs/guides/admin-checklists.md",
    adminSections: [
      "checklists",
      "checklist-activity",
      "checklist-history",
      "checklist-hidden",
      "checklist-settings",
    ],
  },
  {
    slug: "admin-onboarding",
    title: "Admin: onboarding",
    summary: 'Pathways from "I want to serve" to ready for a team.',
    section: "For leaders",
    source: "docs/guides/admin-onboarding.md",
    adminSections: ["onboarding", "onboarding-people", "onboarding-follow-ups"],
  },
  {
    slug: "admin-reports-mentoring-audit",
    title: "Admin: reports, mentoring, and the audit log",
    summary: "Who's ready, pairing mentors, and who changed what.",
    section: "For leaders",
    source: "docs/guides/admin-reports-mentoring-audit.md",
    adminSections: ["reports", "mentoring", "audit"],
  },
  {
    slug: "runbook-service-dashboard",
    title: "Service Dashboard setup",
    summary: "YouTube, the wall TV, and the church bridge.",
    section: "Setting things up",
    source: "docs/runbooks/service-dashboard.md",
    adminSections: ["service-dashboard"],
  },
  {
    slug: "runbook-phone-test",
    title: "Testing on real phones",
    summary: "A 15-minute check on an iPhone and an Android phone.",
    section: "Setting things up",
    source: "docs/runbooks/phone-test.md",
  },
  {
    slug: "runbook-scheduling",
    title: "Planning Center and scheduling setup",
    summary: "Connecting Planning Center, and keeping the sync running.",
    section: "Setting things up",
    source: "docs/runbooks/scheduling.md",
  },
  {
    slug: "runbook-planning-center-sign-in",
    title: "Planning Center sign-in setup",
    summary: "Letting the team sign in with Planning Center.",
    section: "Setting things up",
    source: "docs/runbooks/planning-center-sign-in.md",
  },
  {
    slug: "runbook-messaging",
    title: "Messaging setup",
    summary: "Switching Messages on, the GIPHY key, and where files are kept.",
    section: "Setting things up",
    source: "docs/runbooks/messaging.md",
  },
  {
    slug: "runbook-notifications",
    title: "Notifications and email setup",
    summary: "Sending notification emails through Resend.",
    section: "Setting things up",
    source: "docs/runbooks/notifications.md",
  },
  {
    slug: "runbook-push-alerts",
    title: "Phone alerts setup",
    summary: "Turning on alerts that drop down on phones.",
    section: "Setting things up",
    source: "docs/runbooks/push-alerts.md",
  },
  {
    slug: "runbook-nas-media",
    title: "Church video library setup",
    summary: "Serving lesson videos from the NAS.",
    section: "Setting things up",
    source: "docs/runbooks/nas-media.md",
  },
  {
    slug: "runbook-monitoring",
    title: "Monitoring setup",
    summary: "Error reports and usage counts, and what they never send.",
    section: "Setting things up",
    source: "docs/runbooks/monitoring.md",
  },
  {
    slug: "runbook-backups",
    title: "Backups setup",
    summary: "Weekly encrypted backups, and restoring from them.",
    section: "Setting things up",
    source: "docs/runbooks/backups.md",
  },
];

export function helpPage(slug: string): HelpPage | null {
  return HELP_PAGES.find((page) => page.slug === slug) ?? null;
}

/** Where a guide's own links go: another guide in the app, a web page, or nowhere if unknown. */
export function helpLinkTarget(href: string, fromSource: string): string | null {
  if (/^https:\/\//.test(href)) {
    return href;
  }
  if (href.startsWith("#") || href.includes(":")) {
    return null;
  }
  const [file, hash] = href.split("#");
  const folder = fromSource.split("/").slice(0, -1);
  for (const part of (file ?? "").split("/")) {
    if (part === "..") {
      folder.pop();
    } else if (part !== ".") {
      folder.push(part);
    }
  }
  const target = HELP_PAGES.find((page) => page.source === folder.join("/"));
  return target ? `/help/${target.slug}${hash ? `#${hash}` : ""}` : null;
}

/**
 * The guide for the page someone is on, so Help opens where it's useful. Admin pages come from
 * their section's address; anything else opens the full list.
 */
export function helpHrefFor(
  pathname: string,
  adminPaths: readonly { key: AdminSectionKey; href: string }[],
): string {
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const section = adminPaths
    .filter((entry) => matches(entry.href))
    .toSorted((a, b) => b.href.length - a.href.length)[0];
  const page = section
    ? HELP_PAGES.find((entry) => entry.adminSections?.includes(section.key))
    : HELP_PAGES.find((entry) => entry.paths?.some(matches));
  return page ? `/help/${page.slug}` : "/help";
}
