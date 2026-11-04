"use client";

import { useMemo, useState } from "react";
import { CoursePoster } from "@/components/course-poster";
import { fieldClasses } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { filterLibrary, type LibraryCourse } from "@/lib/domain/library";

type Category = { id: string; name: string; kind: string; sortOrder: number };

/** Search and filters run in the browser, since every course the person can see is already here. */
export function LibraryBrowser({
  courses,
  categories,
}: {
  courses: LibraryCourse[];
  categories: Category[];
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [level, setLevel] = useState("");
  const shown = useMemo(
    () => filterLibrary(courses, { search, categoryId, level }),
    [courses, search, categoryId, level],
  );
  const levels = [...new Set(courses.flatMap((course) => course.level ?? []))].toSorted();
  const filtered = Boolean(search || categoryId || level);
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search courses"
          aria-label="Search courses"
          className={`${fieldClasses} min-h-8 max-w-md min-w-44 flex-1 px-2.5 py-0 text-small pointer-coarse:min-h-11 pointer-coarse:text-field`}
        />
        <select
          aria-label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={`${fieldClasses} min-h-8 w-auto px-2.5 py-0 text-small pointer-coarse:min-h-11 pointer-coarse:text-field`}
        >
          <option value="">All categories</option>
          <optgroup label="General">{options("topic")}</optgroup>
          <optgroup label="Departments">{options("team")}</optgroup>
        </select>
        <select
          aria-label="Level"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className={`${fieldClasses} min-h-8 w-auto px-2.5 py-0 text-small pointer-coarse:min-h-11 pointer-coarse:text-field`}
        >
          <option value="">All levels</option>
          {levels.map((number) => (
            <option key={number} value={number}>
              Level {number}
            </option>
          ))}
        </select>
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryId("");
              setLevel("");
            }}
            className={buttonClasses("tertiary", "", "sm")}
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
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {shown.map((course) => (
            <li key={course.id}>
              <CoursePoster course={course} showCategory />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
