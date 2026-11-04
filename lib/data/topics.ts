import "server-only";
import type { DepartmentCard } from "@/lib/data/departments";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { sortLibrary, type LibraryCourse } from "@/lib/domain/library";
import { storedVideo, videoThumbnailUrl } from "@/lib/domain/video";
import type { LibraryVideo } from "@/lib/domain/videos";

// Topics and Videos (SRS-CUR-019). Row-level security decides who reads; the functions decide who writes.

export type Topic = { id: string; name: string };
export type TopicResult = { ok: true; id?: string } | { ok: false };

export async function listTopics(): Promise<Topic[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("topics")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  if (error) {
    throw new Error("Could not load topics", { cause: error.code });
  }
  return data;
}

/** A lesson's topics, by its stable key, so they carry across versions. */
export async function getLessonTopics(courseId: string, lessonKey: string): Promise<Topic[]> {
  const supabase = await createSupabaseServerClient();
  const tags = await supabase
    .from("lesson_topics")
    .select("topic_id")
    .eq("course_id", courseId)
    .eq("lesson_key", lessonKey);
  if (tags.error) {
    throw new Error("Could not load topics", { cause: tags.error.code });
  }
  if (tags.data.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("topics")
    .select("id, name")
    .in(
      "id",
      tags.data.map((tag) => tag.topic_id),
    )
    .is("archived_at", null)
    .order("name");
  if (error) {
    throw new Error("Could not load topics", { cause: error.code });
  }
  return data;
}

/** A course's own topics. They belong to the course, so they carry across versions. */
export async function getCourseTopics(courseId: string): Promise<Topic[]> {
  const supabase = await createSupabaseServerClient();
  const tags = await supabase.from("course_topics").select("topic_id").eq("course_id", courseId);
  if (tags.error) {
    throw new Error("Could not load topics", { cause: tags.error.code });
  }
  if (tags.data.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("topics")
    .select("id, name")
    .in(
      "id",
      tags.data.map((tag) => tag.topic_id),
    )
    .is("archived_at", null)
    .order("name");
  if (error) {
    throw new Error("Could not load topics", { cause: error.code });
  }
  return data;
}

export async function setCourseTopics(courseId: string, topicIds: string[]): Promise<TopicResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_course_topics", {
    p_course_id: courseId,
    p_topic_ids: topicIds,
  });
  return error ? { ok: false } : { ok: true };
}

export async function setLessonTopics(
  courseId: string,
  lessonKey: string,
  topicIds: string[],
): Promise<TopicResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_lesson_topics", {
    p_course_id: courseId,
    p_lesson_key: lessonKey,
    p_topic_ids: topicIds,
  });
  return error ? { ok: false } : { ok: true };
}

export async function createTopic(name: string): Promise<TopicResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_topic", { p_name: name });
  return error ? { ok: false } : { ok: true, id: data };
}

export async function renameTopic(topicId: string, name: string): Promise<TopicResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("rename_topic", { p_topic_id: topicId, p_name: name });
  return error ? { ok: false } : { ok: true };
}

export async function removeTopic(topicId: string): Promise<TopicResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_topic", { p_topic_id: topicId });
  return error ? { ok: false } : { ok: true };
}

/**
 * Every lesson with a video in a live course, in the categories this person can browse, in the
 * course library's order. The number of calls doesn't grow with the lessons.
 */
export async function getVideoLibrary(
  categories: readonly DepartmentCard[],
): Promise<LibraryVideo[]> {
  const supabase = await createSupabaseServerClient();
  const categoryIds = categories.map((category) => category.id);
  const [courses, levels] = await Promise.all([
    supabase
      .from("courses")
      .select("id, department_id, level_id, sort_order")
      .in("department_id", categoryIds)
      .is("archived_at", null),
    supabase.from("levels").select("id, number").in("department_id", categoryIds),
  ]);
  if (courses.error || levels.error) {
    throw new Error("Could not load videos", { cause: (courses.error ?? levels.error)?.code });
  }
  const courseIds = courses.data.map((course) => course.id);
  const [versions, tags, courseTags] = await Promise.all([
    supabase
      .from("course_versions")
      .select("id, course_id, title")
      .eq("status", "published")
      .in("course_id", courseIds),
    supabase.from("lesson_topics").select("lesson_key, topic_id").in("course_id", courseIds),
    supabase.from("course_topics").select("course_id, topic_id").in("course_id", courseIds),
  ]);
  if (versions.error || tags.error || courseTags.error) {
    throw new Error("Could not load videos", {
      cause: (versions.error ?? tags.error ?? courseTags.error)?.code,
    });
  }
  const lessons = await supabase
    .from("lessons")
    .select(
      "course_version_id, lesson_key, title, estimated_minutes, sort_order, video_provider, video_ref",
    )
    .in(
      "course_version_id",
      versions.data.map((version) => version.id),
    )
    .not("video_ref", "is", null)
    .order("sort_order");
  if (lessons.error) {
    throw new Error("Could not load videos", { cause: lessons.error.code });
  }
  const levelNumber = new Map(levels.data.map((level) => [level.id, level.number]));
  const inCourseOrder = sortLibrary(
    courses.data.flatMap((course): LibraryCourse[] => {
      const version = versions.data.find((v) => v.course_id === course.id);
      const category = categories.find((c) => c.id === course.department_id);
      if (!version || !category) {
        return [];
      }
      return [
        {
          id: course.id,
          title: version.title,
          href: "",
          category: {
            id: category.id,
            slug: category.slug,
            name: category.name,
            kind: category.kind,
            hue: category.hue,
            icon: category.icon,
            sortOrder: category.sortOrder,
          },
          level: category.usesLevels ? (levelNumber.get(course.level_id) ?? null) : null,
          sortOrder: course.sort_order,
          lessonCount: null,
          estimatedMinutes: null,
          coverUrl: null,
          topicIds: [],
          percent: 0,
          state: "not_started",
        },
      ];
    }),
  );
  return inCourseOrder.flatMap((course) => {
    const version = versions.data.find((v) => v.course_id === course.id);
    return lessons.data
      .filter((lesson) => lesson.course_version_id === version?.id)
      .flatMap((lesson) => {
        const video = storedVideo(lesson.video_provider, lesson.video_ref);
        return video
          ? [
              {
                key: lesson.lesson_key,
                title: lesson.title,
                href: `/courses/${course.id}/lessons/${lesson.lesson_key}`,
                thumbnailUrl: videoThumbnailUrl(video),
                minutes: lesson.estimated_minutes,
                courseTitle: course.title,
                category: course.category,
                level: course.level,
                // A lesson counts for its own topics and its course's.
                topicIds: [
                  ...new Set([
                    ...tags.data
                      .filter((tag) => tag.lesson_key === lesson.lesson_key)
                      .map((tag) => tag.topic_id),
                    ...courseTags.data
                      .filter((tag) => tag.course_id === course.id)
                      .map((tag) => tag.topic_id),
                  ]),
                ],
              },
            ]
          : [];
      });
  });
}
