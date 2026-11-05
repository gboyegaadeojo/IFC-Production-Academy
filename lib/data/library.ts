import "server-only";
import { cache } from "react";
import type { DepartmentCard } from "@/lib/data/departments";
import { getCourseProgressById, getLearnerActivity } from "@/lib/data/progress";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { publicEnv } from "@/lib/env";
import { courseCoverUrl, sortLibrary, type LibraryCourse } from "@/lib/domain/library";
import { perRequestBatch } from "@/lib/domain/per-request";
import type { CourseProgress, CourseState } from "@/lib/domain/progress";

/** Where a Start the course button goes. That page works out the next step on the click. */
const openHref = (courseId: string) => `/courses/${courseId}/open`;

type CourseSummary = { title: string; estimatedMinutes: number | null; lessonCount: number };

/**
 * Titles and lesson counts, without each course's outline: these pages list many courses. Each
 * course is read once per page, however many sections want it.
 */
const publishedSummaries = perRequestBatch(
  cache(() => new Map<string, Promise<CourseSummary | undefined>>()),
  readPublishedSummaries,
);

async function readPublishedSummaries(courseIds: string[]): Promise<Map<string, CourseSummary>> {
  const supabase = await createSupabaseServerClient();
  const versions = await supabase
    .from("course_versions")
    .select("id, course_id, title, estimated_minutes")
    .eq("status", "published")
    .in("course_id", courseIds);
  if (versions.error) {
    throw new Error("Could not load the courses", { cause: versions.error.code });
  }
  const lessons = await supabase
    .from("lessons")
    .select("course_version_id")
    .in(
      "course_version_id",
      versions.data.map((version) => version.id),
    );
  if (lessons.error) {
    throw new Error("Could not load the courses", { cause: lessons.error.code });
  }
  const counts = new Map<string, number>();
  for (const lesson of lessons.data) {
    counts.set(lesson.course_version_id, (counts.get(lesson.course_version_id) ?? 0) + 1);
  }
  return new Map(
    versions.data.map((version) => [
      version.course_id,
      {
        title: version.title,
        estimatedMinutes: version.estimated_minutes,
        lessonCount: counts.get(version.id) ?? 0,
      },
    ]),
  );
}

/** Progress only for courses this person has opened. Everything else hasn't been started. */
async function progressForOpened(
  userId: string,
  courseIds: string[],
): Promise<Map<string, CourseProgress>> {
  const activity = await getLearnerActivity(userId, courseIds);
  return getCourseProgressById(userId, [...activity.keys()]);
}

/**
 * Every published course in the categories this person can browse, with their own progress
 * (SRS-CUR-017). The number of calls doesn't grow with the courses, and Training shows it, so it
 * has to stay light (the thirty-people test).
 */
export async function getCourseLibrary(
  userId: string,
  categories: readonly DepartmentCard[],
): Promise<LibraryCourse[]> {
  const supabase = await createSupabaseServerClient();
  const categoryIds = categories.map((category) => category.id);
  const [courses, levels] = await Promise.all([
    supabase
      .from("courses")
      .select("id, department_id, level_id, sort_order, cover_image_path")
      .in("department_id", categoryIds)
      .is("archived_at", null),
    supabase.from("levels").select("id, number").in("department_id", categoryIds),
  ]);
  if (courses.error || levels.error) {
    throw new Error("Could not load the courses", { cause: (courses.error ?? levels.error)?.code });
  }
  const ids = courses.data.map((row) => row.id);
  const [summaries, progress, courseTags, lessonTags] = await Promise.all([
    publishedSummaries(ids),
    progressForOpened(userId, ids),
    supabase.from("course_topics").select("course_id, topic_id").in("course_id", ids),
    supabase.from("lesson_topics").select("course_id, topic_id").in("course_id", ids),
  ]);
  if (courseTags.error || lessonTags.error) {
    throw new Error("Could not load the courses", {
      cause: (courseTags.error ?? lessonTags.error)?.code,
    });
  }
  // A course counts for its own topics and those of its lessons.
  const allTags = [...courseTags.data, ...lessonTags.data];
  const levelNumber = new Map(levels.data.map((level) => [level.id, level.number]));
  const { NEXT_PUBLIC_SUPABASE_URL: url } = publicEnv();

  return sortLibrary(
    courses.data.flatMap((row) => {
      const summary = summaries.get(row.id);
      const category = categories.find((c) => c.id === row.department_id);
      if (!summary || !category) {
        return [];
      }
      const courseProgress = progress.get(row.id);
      return [
        {
          id: row.id,
          title: summary.title,
          // A poster opens the course's summary, which has its own Start or Continue (G, 2026-11-05).
          href: `/courses/${row.id}`,
          category: {
            id: category.id,
            slug: category.slug,
            name: category.name,
            kind: category.kind,
            hue: category.hue,
            icon: category.icon,
            sortOrder: category.sortOrder,
          },
          level: category.usesLevels ? (levelNumber.get(row.level_id) ?? null) : null,
          sortOrder: row.sort_order,
          lessonCount: summary.lessonCount > 0 ? summary.lessonCount : null,
          estimatedMinutes: summary.estimatedMinutes,
          coverUrl: row.cover_image_path ? courseCoverUrl(url, row.cover_image_path) : null,
          topicIds: [
            ...new Set(
              allTags.filter((tag) => tag.course_id === row.id).map((tag) => tag.topic_id),
            ),
          ],
          percent: courseProgress?.percent ?? 0,
          state: courseProgress?.state ?? "not_started",
        } satisfies LibraryCourse,
      ];
    }),
  );
}

export type StartHereCourse = {
  id: string;
  title: string;
  href: string;
  state: CourseState;
  estimatedMinutes: number | null;
};

/**
 * The courses marked Start here, with this person's progress (SRS-CUR-018). Training and the
 * department page both show them, and they're never a gate.
 */
export const getStartHereCourses = cache(async (userId: string): Promise<StartHereCourse[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id")
    .eq("start_here", true)
    .is("archived_at", null)
    .order("sort_order");
  if (error) {
    throw new Error("Could not load the courses", { cause: error.code });
  }
  return courseCards(
    userId,
    data.map((row) => row.id),
  );
});

/** Given courses, in the order given, leaving out any archived or not published. */
export async function getPublishedCourseCards(
  userId: string,
  courseIds: string[],
): Promise<StartHereCourse[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id")
    .in("id", courseIds)
    .is("archived_at", null);
  if (error) {
    throw new Error("Could not load the courses", { cause: error.code });
  }
  const live = new Set(data.map((row) => row.id));
  return courseCards(
    userId,
    courseIds.filter((id) => live.has(id)),
  );
}

async function courseCards(userId: string, ids: string[]): Promise<StartHereCourse[]> {
  if (ids.length === 0) {
    return [];
  }
  const [summaries, progress] = await Promise.all([
    publishedSummaries(ids),
    progressForOpened(userId, ids),
  ]);
  return ids.flatMap((id) => {
    const summary = summaries.get(id);
    return summary
      ? [
          {
            id,
            title: summary.title,
            href: openHref(id),
            state: progress.get(id)?.state ?? "not_started",
            estimatedMinutes: summary.estimatedMinutes,
          },
        ]
      : [];
  });
}
