"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";

export type PathCourse = {
  id: string;
  title: string;
  href: string;
  percent: number;
  meta: string;
  /** The course's cover art; null shows the department's colour instead. */
  coverUrl: string | null;
};

export type PathLevel = {
  id: string;
  number: number;
  name: string;
  summary: string;
  /** "3 courses · 6 of 27 lessons done", or "Coming later". */
  meta: string;
  percent: number;
  courses: PathCourse[];
};

/**
 * The levels as a path (department page D, approved 2026-11-07): each level a card with a ring of
 * lessons done, joined by a line, opening to show its courses. The level holding what you're doing
 * opens first. A category without levels shows its courses straight away.
 */
export function DepartmentPath({
  levels,
  initialOpen,
  usesLevels,
  canOpen,
}: {
  levels: PathLevel[];
  initialOpen: number;
  usesLevels: boolean;
  canOpen: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  if (!usesLevels) {
    const courses = levels.flatMap((level) => level.courses);
    return courses.length === 0 ? (
      <p className="text-small text-text-muted">Courses are coming soon.</p>
    ) : (
      <CourseGrid courses={courses} canOpen={canOpen} />
    );
  }
  return (
    <ol className="relative flex flex-col gap-3">
      <span
        aria-hidden="true"
        className="absolute top-10 bottom-10 left-[2.4rem] w-0.5 bg-border sm:left-[2.6rem]"
      />
      {levels.map((level, index) => (
        <li key={level.id}>
          <LevelCard
            level={level}
            open={open === index}
            onToggle={() => setOpen(open === index ? -1 : index)}
            canOpen={canOpen}
          />
        </li>
      ))}
    </ol>
  );
}

function LevelCard({
  level,
  open,
  onToggle,
  canOpen,
}: {
  level: PathLevel;
  open: boolean;
  onToggle: () => void;
  canOpen: boolean;
}) {
  const panelId = useId();
  const headingId = `level-${level.id}`;
  const empty = level.courses.length === 0;
  return (
    <article
      aria-labelledby={headingId}
      className={`relative overflow-hidden rounded-card border bg-surface transition-surface ${
        open ? "border-[color-mix(in_srgb,var(--dept)_35%,var(--border))]" : "border-border"
      }`}
    >
      <h3 id={headingId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-touch w-full items-center gap-3.5 p-3.5 text-left transition-surface hover:bg-card sm:p-4"
        >
          <Ring percent={level.percent} label={String(level.number)} muted={empty} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-semibold">
              <span className="sr-only">Level {level.number}: </span>
              <span aria-hidden="true" className="hidden sm:inline">
                Level {level.number} ·{" "}
              </span>
              {level.name}
            </span>
            <span className="text-small font-normal text-text-muted">{level.meta}</span>
          </span>
          <ChevronDownIcon
            className={`size-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </h3>
      <div id={panelId} hidden={!open}>
        {level.summary ? (
          <p className="max-w-[65ch] px-3.5 pb-3.5 text-small text-text-secondary sm:pl-[5.25rem]">
            {level.summary}
          </p>
        ) : null}
        {empty ? (
          <p className="border-t border-border px-4 py-3 text-small text-text-muted">
            Courses for this level are coming later.
          </p>
        ) : (
          <div className="border-t border-border p-3 sm:p-4">
            <CourseGrid courses={level.courses} canOpen={canOpen} />
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Rows with a small cover on a phone; posters in a grid from 768px. Each course shows its own cover
 * art, as on Courses (G, 2026-11-07); one without a cover shows the department's colour.
 */
function CourseGrid({ courses, canOpen }: { courses: PathCourse[]; canOpen: boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] md:gap-4">
      {courses.map((course) => (
        <li key={course.id}>
          {canOpen ? (
            <Link
              href={course.href}
              className="group flex items-center gap-3 rounded-button md:flex-col md:items-stretch md:gap-2"
            >
              {course.coverUrl ? (
                // Decorative: the title is right beside it.
                // eslint-disable-next-line @next/next/no-img-element -- covers are already sized; next/image needs a loader on Workers
                <img
                  src={course.coverUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-[3/4] w-12 shrink-0 rounded-button bg-card object-cover shadow-sm transition-[filter] group-hover:brightness-105 md:w-full md:rounded-card"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="aspect-[3/4] w-12 shrink-0 rounded-button bg-[color-mix(in_srgb,var(--dept)_70%,var(--photo-bg))] transition-[filter] group-hover:brightness-110 md:w-full md:rounded-card"
                />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-2 font-semibold group-hover:text-accent-light">
                  <span className="min-w-0 flex-1">{course.title}</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-text-muted md:hidden" />
                </span>
                <span
                  role="progressbar"
                  aria-label={`${course.title}: ${course.percent}% done`}
                  aria-valuenow={course.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="block h-1 overflow-hidden rounded-pill bg-hover"
                >
                  <span
                    className="block h-full rounded-pill bg-[var(--dept)]"
                    style={{ width: `${course.percent}%` }}
                  />
                </span>
                <span className="text-small text-text-muted">{course.meta}</span>
              </span>
            </Link>
          ) : (
            <span className="flex flex-col gap-1 rounded-card border border-dashed border-border px-4 py-3">
              <span className="font-medium text-text-secondary">{course.title}</span>
              <span className="text-small text-text-muted">Not open yet</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A ring of lessons done around the level's number. Decorative: the words say the same. */
export function Ring({
  percent,
  label,
  muted = false,
  size = "md",
}: {
  percent: number;
  label?: string;
  muted?: boolean;
  size?: "md" | "lg";
}) {
  const circumference = 2 * Math.PI * 15;
  return (
    <span
      aria-hidden="true"
      className={`relative shrink-0 ${size === "lg" ? "size-14" : "size-11 sm:size-12"}`}
    >
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" className="stroke-hover" />
        {percent > 0 ? (
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            stroke="var(--dept)"
            strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
          />
        ) : null}
      </svg>
      {label ? (
        <span
          className={`absolute inset-0 flex items-center justify-center font-bold ${
            muted ? "text-text-muted" : "text-[var(--dept)]"
          }`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
