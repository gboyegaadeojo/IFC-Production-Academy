"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CoursePoster } from "@/components/course-poster";
import { TopicFilter } from "@/components/topic-filter";
import { compactFieldClasses } from "@/components/ui/field-classes";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseCountLabel } from "@/lib/domain/home";
import {
  continuingCourses,
  filterLibrary,
  libraryRows,
  type LibraryCourse,
} from "@/lib/domain/library";

type Category = { id: string; name: string; kind: string; sortOrder: number; hue: string };

/** Search and filters run in the browser, since every course the person can see is already here. */
export function LibraryBrowser({
  courses,
  categories,
  topics,
  initialTopicIds,
}: {
  courses: LibraryCourse[];
  categories: Category[];
  topics: { id: string; name: string }[];
  initialTopicIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [level, setLevel] = useState("");
  const [topicIds, setTopicIds] = useState(initialTopicIds);
  const shown = useMemo(
    () => filterLibrary(courses, { search, categoryId, level, topicIds }),
    [courses, search, categoryId, level, topicIds],
  );
  const levels = [...new Set(courses.flatMap((course) => course.level ?? []))].toSorted();
  const filtered = Boolean(search || categoryId || level || topicIds.length);
  const withCourses = categories.filter((category) =>
    courses.some((course) => course.category.id === category.id),
  );
  const options = (kind: string) =>
    withCourses
      .filter((category) => category.kind === kind)
      .map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ));

  const teams = withCourses
    .filter((category) => category.kind === "team")
    .toSorted((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      {teams.length > 0 ? (
        <section
          aria-labelledby="browse-departments-heading"
          className="flex min-w-0 flex-col gap-3"
        >
          <h2 id="browse-departments-heading" className="text-subheading font-bold tracking-tight">
            Browse by department
          </h2>
          {/* A row that scrolls sideways, so more departments never crowd the page (G, 2026-11-06). */}
          <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            {teams.map((team) => {
              const chosen = categoryId === team.id;
              const count = courses.filter((course) => course.category.id === team.id).length;
              return (
                <li key={team.id} className="shrink-0 snap-start">
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setCategoryId(chosen ? "" : team.id)}
                    style={{ "--dept": departmentHueVar(team.hue) } as CSSProperties}
                    className={`flex h-24 w-40 flex-col justify-between rounded-card bg-[color-mix(in_srgb,var(--dept)_55%,var(--photo-bg))] p-3 text-left text-on-accent transition-surface hover:brightness-110 ${
                      chosen ? "ring-2 ring-accent-light ring-offset-2 ring-offset-bg" : ""
                    }`}
                  >
                    <span className="text-small font-medium opacity-85">
                      {courseCountLabel(count)}
                    </span>
                    <span className="leading-tight font-bold">{team.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search courses"
          aria-label="Search courses"
          className={`${compactFieldClasses} max-w-md min-w-44 flex-1`}
        />
        <select
          aria-label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={`${compactFieldClasses} w-auto`}
        >
          <option value="">All categories</option>
          <optgroup label="General">{options("topic")}</optgroup>
          <optgroup label="Departments">{options("team")}</optgroup>
        </select>
        <select
          aria-label="Level"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className={`${compactFieldClasses} w-auto`}
        >
          <option value="">All levels</option>
          {levels.map((number) => (
            <option key={number} value={number}>
              Level {number}
            </option>
          ))}
        </select>
        <TopicFilter topics={topics} selected={topicIds} onChange={setTopicIds} />
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryId("");
              setLevel("");
              setTopicIds([]);
            }}
            className={`${buttonClasses("tertiary", "", "sm")} order-2`}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      <p role="status" className="text-small text-text-muted">
        {shown.length === 1 ? "1 course" : `${shown.length} courses`}
      </p>
      {shown.length === 0 ? (
        <EmptyState title={filtered ? "No courses match" : "No courses yet"}>
          {filtered
            ? "Try a different word, or clear the filters."
            : "Courses appear here when they're published."}
        </EmptyState>
      ) : (
        <>
          {filtered ? null : <PhoneRows courses={courses} onSeeAll={(id) => setCategoryId(id)} />}
          <ul
            className={`grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 ${
              filtered ? "grid" : "hidden md:grid"
            }`}
          >
            {shown.map((course) => (
              <li key={course.id}>
                <CoursePoster course={course} showCategory />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * On a phone, before any search or filter: what you've started, then a row per category that
 * scrolls sideways (refinements mock, approved 2026-11-06). See all shows that category alone,
 * as a grid. Wider screens keep the grid.
 */
function PhoneRows({
  courses,
  onSeeAll,
}: {
  courses: LibraryCourse[];
  onSeeAll: (categoryId: string) => void;
}) {
  const continuing = continuingCourses(courses);
  return (
    <div className="flex flex-col gap-7 md:hidden">
      {continuing.length > 0 ? (
        <ScrollRail id="continue-heading" title="Continue">
          {continuing.map((course) => (
            <li key={course.id} className="w-36">
              <CoursePoster course={course} showCategory />
            </li>
          ))}
        </ScrollRail>
      ) : null}
      {libraryRows(courses).map(({ category, courses: inCategory }) => (
        <ScrollRail
          key={category.id}
          id={`row-${category.id}`}
          title={category.name}
          aside={
            <button
              type="button"
              onClick={() => onSeeAll(category.id)}
              className="min-h-touch shrink-0 text-small font-medium whitespace-nowrap text-accent-light underline-offset-4 hover:underline"
            >
              See all {inCategory.length}
              <span className="sr-only"> in {category.name}</span>
            </button>
          }
        >
          {inCategory.map((course) => (
            <li key={course.id} className="w-36">
              <CoursePoster course={course} />
            </li>
          ))}
        </ScrollRail>
      ))}
    </div>
  );
}
