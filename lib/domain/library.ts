/**
 * The course library (SRS-CUR-017): rows of courses by category on Training, and Courses with
 * search and filters. Pure rules; nothing here knows about a specific category.
 */
import type { DepartmentKind } from "./departments";
import type { CourseState } from "./progress";

export const COURSE_COVER_MAX_BYTES = 2 * 1024 * 1024;

export type LibraryCourse = {
  id: string;
  title: string;
  /** Where opening it goes: the next thing to do, or the overview once it's finished. */
  href: string;
  category: {
    id: string;
    slug: string;
    name: string;
    kind: DepartmentKind;
    hue: string;
    icon: string;
    sortOrder: number;
  };
  /** Null in a category without levels. */
  level: number | null;
  sortOrder: number;
  lessonCount: number | null;
  estimatedMinutes: number | null;
  coverUrl: string | null;
  /** Only once the person has started. Never claims more than they marked done (SRS-LESSON-006). */
  percent: number;
  state: CourseState;
};

/** Topics first, then departments, each in their set order, then by level and position. */
export function sortLibrary(courses: readonly LibraryCourse[]): LibraryCourse[] {
  const kindOrder = (course: LibraryCourse) => (course.category.kind === "topic" ? 0 : 1);
  return courses.toSorted(
    (a, b) =>
      kindOrder(a) - kindOrder(b) ||
      a.category.sortOrder - b.category.sortOrder ||
      (a.level ?? 0) - (b.level ?? 0) ||
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title),
  );
}

export type LibraryRow = { category: LibraryCourse["category"]; courses: LibraryCourse[] };

/** One row per category with published courses. An empty category has no row. */
export function libraryRows(courses: readonly LibraryCourse[]): LibraryRow[] {
  const rows = new Map<string, LibraryRow>();
  for (const course of sortLibrary(courses)) {
    const row = rows.get(course.category.id);
    if (row) {
      row.courses.push(course);
    } else {
      rows.set(course.category.id, { category: course.category, courses: [course] });
    }
  }
  return [...rows.values()];
}

export type LibraryFilter = { search: string; categoryId: string; level: string };

export function filterLibrary(
  courses: readonly LibraryCourse[],
  { search, categoryId, level }: LibraryFilter,
): LibraryCourse[] {
  const words = search.trim().toLowerCase();
  return courses.filter(
    (course) =>
      (!words || course.title.toLowerCase().includes(words)) &&
      (!categoryId || course.category.id === categoryId) &&
      (!level || String(course.level) === level),
  );
}

/** A poster's small print: "Level 1 · 5 lessons · About 40 min". */
export function courseFacts(
  course: Pick<LibraryCourse, "level" | "lessonCount" | "estimatedMinutes">,
) {
  return [
    course.level === null ? null : `Level ${course.level}`,
    course.lessonCount === null
      ? null
      : `${course.lessonCount} ${course.lessonCount === 1 ? "lesson" : "lessons"}`,
    course.estimatedMinutes ? `${course.estimatedMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The image type from the file's first bytes, whatever its name claims. Null if it isn't one we take. */
export function coverImageType(
  bytes: Uint8Array,
): { extension: string; contentType: string } | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47)) {
    return { extension: "png", contentType: "image/png" };
  }
  if (starts(0xff, 0xd8, 0xff)) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

export function courseCoverUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/course-covers/${path}`;
}
