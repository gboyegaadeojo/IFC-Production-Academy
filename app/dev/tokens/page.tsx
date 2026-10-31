import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Design tokens" };

const colourGroups: { title: string; tokens: { name: string; use: string }[] }[] = [
  {
    title: "Surfaces",
    tokens: [
      { name: "bg", use: "App canvas" },
      { name: "surface", use: "Navigation, panels" },
      { name: "card", use: "Course and content cards" },
      { name: "hover", use: "Hover, selected" },
      { name: "border", use: "Decorative dividers" },
      { name: "border-strong", use: "Form controls (3:1 or more)" },
    ],
  },
  {
    title: "Text",
    tokens: [
      { name: "text", use: "Main text" },
      { name: "text-secondary", use: "Supporting text" },
      { name: "text-muted", use: "Metadata" },
    ],
  },
  {
    title: "Action",
    tokens: [
      { name: "accent", use: "Button fills, selected nav" },
      { name: "accent-light", use: "Accent text and links on dark" },
    ],
  },
  {
    title: "Status",
    tokens: [
      { name: "success", use: "Completed" },
      { name: "warning", use: "Pending, attention" },
      { name: "error", use: "Errors, failed outcomes" },
      { name: "info", use: "Informational" },
    ],
  },
];

const departmentHues = [
  { hue: "blue", icon: "camera", label: "Camera Operations" },
  { hue: "teal", icon: "audio", label: "Audio Engineering" },
  { hue: "violet", icon: "graphics", label: "Computer Graphics and ProPresenter" },
  { hue: "coral", icon: "directing", label: "Camera Directing" },
  { hue: "amber", icon: "lighting", label: "Lighting Operations" },
];

const typeScale = [
  { className: "text-display", label: "Display 30–44 (hero)" },
  { className: "text-title", label: "Title 25–30 (page)" },
  { className: "text-heading", label: "Heading 20–22 (section)" },
  { className: "text-subheading", label: "Subheading 17 (card)" },
  { className: "text-lead", label: "Lead 17" },
  { className: "text-body", label: "Body 15" },
  { className: "text-small", label: "Small 13" },
];

/** Token preview (CLAUDE.md first task). Development only: production builds return 404. */
export default function TokensPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main id="main" className="page-container flex flex-col gap-12 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Design tokens</h1>
        <p className="text-text-secondary">
          docs/DESIGN-REQUIREMENTS.md §4. Dark theme first. Only visible in development.
        </p>
      </header>

      {colourGroups.map((group) => (
        <section key={group.title} className="flex flex-col gap-4">
          <h2 className="text-subheading font-semibold">{group.title}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {group.tokens.map((token) => (
              <li key={token.name} className="rounded-card border border-border bg-card p-4">
                <div
                  className="h-16 rounded-button border border-border"
                  style={{ background: `var(--${token.name})` }}
                />
                <p className="mt-3 font-mono text-small">--{token.name}</p>
                <p className="text-small text-text-muted">{token.use}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-4">
        <h2 className="text-subheading font-semibold">Department hues</h2>
        <p className="text-text-secondary">Covers, icons, rings, and badges only. Never buttons.</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {departmentHues.map((item) => (
            <li
              key={item.hue}
              style={{ "--dept": `var(--dept-${item.hue})` } as CSSProperties}
              className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-4"
            >
              <span className="flex size-12 items-center justify-center rounded-card border border-[var(--dept)] text-[var(--dept)]">
                <DepartmentIcon icon={item.icon} />
              </span>
              <p className="font-mono text-small">--dept-{item.hue}</p>
              <p className="text-small text-text-muted">{item.label}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-subheading font-semibold">Type scale</h2>
        <ul className="flex flex-col gap-3">
          {typeScale.map((item) => (
            <li key={item.className} className={item.className}>
              {item.label} · Continue Learning <span className="tabular">0123456789</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-subheading font-semibold">Buttons and status</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Continue Learning</Button>
          <Button variant="secondary">Review this procedure</Button>
          <Button variant="tertiary">Explore training →</Button>
          <Button variant="destructive">Remove member</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone="success">Approved for Independent Service</StatusBadge>
          <StatusBadge tone="pending">Ready for Practical Assessment</StatusBadge>
          <StatusBadge tone="info">Coming soon</StatusBadge>
          <StatusBadge tone="neutral">Not started</StatusBadge>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-subheading font-semibold">Radius and motion</h2>
        <div className="flex flex-wrap items-center gap-4 text-small text-text-secondary">
          <div className="rounded-card border border-border bg-card p-4">Card radius 16</div>
          <div className="rounded-button border border-border bg-card p-4">Button radius 12</div>
          <div className="rounded-pill border border-border bg-card px-4 py-2">Pill</div>
          <div className="rounded-card border border-border bg-card p-4 transition-colors duration-[var(--duration-base)] hover:bg-hover">
            Hover me: 200 ms, 0 ms with reduced motion
          </div>
        </div>
      </section>
    </main>
  );
}
