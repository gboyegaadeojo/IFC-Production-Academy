import type { ReactNode } from "react";

/**
 * Line icons keyed by the department's `icon` value. Adding a department needs no code unless it
 * wants a new icon; unknown keys get a neutral fallback.
 */
const paths: Record<string, ReactNode> = {
  camera: (
    <>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 10.5l5-3v9l-5-3" />
    </>
  ),
  audio: (
    <>
      <path d="M6 4v16M12 4v16M18 4v16" />
      <rect x="4" y="13" width="4" height="3" rx="1" />
      <rect x="10" y="7" width="4" height="3" rx="1" />
      <rect x="16" y="11" width="4" height="3" rx="1" />
    </>
  ),
  graphics: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4M7 9h6M7 12h10" />
    </>
  ),
  directing: (
    <>
      <path d="M4 14v-2a8 8 0 0116 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
      <path d="M19 20c0 1-1 1.5-3 1.5h-2" />
    </>
  ),
  lighting: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />
    </>
  ),
  livestream: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7M5.6 18.4a9 9 0 010-12.8M18.4 5.6a9 9 0 010 12.8" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  photography: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  social: (
    <>
      <path d="M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1z" />
      <path d="M16 9a4 4 0 010 6M19 6.5a8 8 0 010 11" />
    </>
  ),
  stage: (
    <>
      <path d="M3 20h18M5 20v-4h14v4" />
      <path d="M8 4l-2 8M16 4l2 8M12 4v8" />
    </>
  ),
  editing: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M7 5v4M12 5v4M17 5v4M10 12.5v4l3.5-2z" />
    </>
  ),
};

/** Icons a department can pick when it's created, with words for the picker. */
export const DEPARTMENT_ICON_OPTIONS: { key: string; label: string }[] = [
  { key: "camera", label: "Camera" },
  { key: "audio", label: "Sound desk" },
  { key: "graphics", label: "Screens and slides" },
  { key: "directing", label: "Headset" },
  { key: "lighting", label: "Lighting" },
  { key: "livestream", label: "Livestream" },
  { key: "music", label: "Music" },
  { key: "photography", label: "Photography" },
  { key: "social", label: "Announcements" },
  { key: "stage", label: "Stage" },
  { key: "editing", label: "Video editing" },
];

const fallback = (
  <>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </>
);

export function DepartmentIcon({
  icon,
  className = "size-6",
}: {
  icon: string;
  className?: string;
}) {
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
      {paths[icon] ?? fallback}
    </svg>
  );
}
