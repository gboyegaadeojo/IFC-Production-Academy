import "server-only";
import { listDepartmentCards, type DepartmentCard } from "@/lib/data/departments";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  orderedOutline,
  type CoursePractical,
  type CourseQuiz,
  type OutlineModule,
} from "@/lib/domain/learning";
import { storedVideo, type VideoRef } from "@/lib/domain/video";

// Learner pages (DESIGN §6.3–6.5). Read-only. Row-level security decides what each person sees:
// anyone signed in can browse published course titles; lessons are readable only by members of the
// department and by its curriculum staff (SRS-MEM-005, SRS-MEM-006).

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type PathwayCourse = {
  id: string;
  title: string;
  summary: string;
  versionNumber: number;
  /** Known only when the person may open the course. */
  lessonCount: number | null;
  estimatedMinutes: number | null;
};

export type PathwayLevel = {
  id: string;
  number: number;
  name: string;
  summary: string;
  courses: PathwayCourse[];
};

export type DepartmentPathway = {
  department: DepartmentCard;
  levels: PathwayLevel[];
  /** True wherever lessons can be opened: everyone in the Academy (open training, 2026-11-01). */
  canOpenCourses: boolean;
};

async function publishedVersions(supabase: Client, courseIds: string[]) {
  if (courseIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("course_versions")
    .select("id, course_id, version_number, title, summary, objectives, estimated_minutes")
    .eq("status", "published")
    .in("course_id", courseIds);
  if (error) {
    throw new Error("Could not load courses", { cause: error.code });
  }
  return data;
}

/** A department's three-level pathway with its published courses. Null if it can't be browsed. */
export async function getDepartmentPathway(
  userId: string,
  slug: string,
): Promise<DepartmentPathway | null> {
  const department = (await listDepartmentCards(userId)).find((card) => card.slug === slug);
  if (!department) {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const [levels, courses] = await Promise.all([
    supabase
      .from("levels")
      .select("id, number, name, summary")
      .eq("department_id", department.id)
      .order("number"),
    supabase
      .from("courses")
      .select("id, level_id, sort_order")
      .eq("department_id", department.id)
      .is("archived_at", null)
      .order("sort_order"),
  ]);
  if (levels.error || courses.error) {
    throw new Error("Could not load the pathway", { cause: (levels.error ?? courses.error)?.code });
  }

  const versions = await publishedVersions(
    supabase,
    courses.data.map((course) => course.id),
  );
  const lessons = versions.length
    ? await supabase
        .from("lessons")
        .select("course_version_id")
        .in(
          "course_version_id",
          versions.map((version) => version.id),
        )
    : { data: [], error: null };
  if (lessons.error) {
    throw new Error("Could not load lessons", { cause: lessons.error.code });
  }
  const readable = lessons.data.length > 0;
  // Training is open to everyone (decision 2026-11-01); a hidden department's lessons aren't readable.
  const canOpenCourses = readable || department.state.kind !== "unavailable";

  return {
    department,
    canOpenCourses,
    levels: levels.data.map((level) => ({
      id: level.id,
      number: level.number,
      name: level.name,
      summary: level.summary,
      courses: courses.data
        .filter((course) => course.level_id === level.id)
        .flatMap((course) => {
          const version = versions.find((v) => v.course_id === course.id);
          if (!version || version.version_number === null) {
            return [];
          }
          return [
            {
              id: course.id,
              title: version.title,
              summary: version.summary,
              versionNumber: version.version_number,
              lessonCount: readable
                ? lessons.data.filter((row) => row.course_version_id === version.id).length
                : null,
              estimatedMinutes: version.estimated_minutes,
            },
          ];
        }),
    })),
  };
}

export type LearnerCourse = {
  id: string;
  versionId: string;
  versionNumber: number;
  title: string;
  summary: string;
  objectives: string[];
  estimatedMinutes: number | null;
  department: { id: string; slug: string; name: string; hue: string; icon: string };
  level: { number: number; name: string };
  /** Empty when the person may not read the lessons (not a member). */
  modules: OutlineModule[];
  /** The live version's quizzes, in placement order. Empty when lessons aren't readable. */
  quizzes: CourseQuiz[];
  /** The live version's practical assessments. Empty when lessons aren't readable. */
  practicals: CoursePractical[];
  canOpen: boolean;
};

/** The live version of a course, with its outline when readable. Null if not published. */
export async function getLearnerCourse(courseId: string): Promise<LearnerCourse | null> {
  const supabase = await createSupabaseServerClient();
  const course = await supabase
    .from("courses")
    .select("id, department_id, level_id, archived_at")
    .eq("id", courseId)
    .maybeSingle();
  if (course.error) {
    throw new Error("Could not load the course", { cause: course.error.code });
  }
  if (!course.data || course.data.archived_at !== null) {
    return null;
  }
  const [version] = await publishedVersions(supabase, [course.data.id]);
  if (!version || version.version_number === null) {
    return null;
  }
  const [department, level, modules, lessons, quizzes, practicals] = await Promise.all([
    supabase
      .from("departments")
      .select("id, slug, name, hue, icon")
      .eq("id", course.data.department_id)
      .maybeSingle(),
    supabase.from("levels").select("number, name").eq("id", course.data.level_id).maybeSingle(),
    supabase
      .from("course_modules")
      .select("id, module_key, title, summary, sort_order")
      .eq("course_version_id", version.id),
    supabase
      .from("lessons")
      .select("lesson_key, module_id, title, is_required, estimated_minutes, sort_order")
      .eq("course_version_id", version.id),
    supabase
      .from("quizzes")
      .select("quiz_key, title, is_required, after_module_key")
      .eq("course_version_id", version.id)
      .order("sort_order"),
    supabase
      .from("practicals")
      .select("practical_key, title, is_required, after_module_key")
      .eq("course_version_id", version.id)
      .order("sort_order"),
  ]);
  if (
    department.error ||
    level.error ||
    modules.error ||
    lessons.error ||
    quizzes.error ||
    practicals.error
  ) {
    const failed =
      department.error ??
      level.error ??
      modules.error ??
      lessons.error ??
      quizzes.error ??
      practicals.error;
    throw new Error("Could not load the course", { cause: failed?.code });
  }
  const moduleIdByKey = new Map(modules.data.map((m) => [m.module_key, m.id]));
  if (!department.data || !level.data) {
    return null;
  }

  return {
    id: course.data.id,
    versionId: version.id,
    versionNumber: version.version_number,
    title: version.title,
    summary: version.summary,
    objectives: version.objectives,
    estimatedMinutes: version.estimated_minutes,
    department: department.data,
    level: level.data,
    canOpen: lessons.data.length > 0,
    practicals: practicals.data.map((practical) => ({
      key: practical.practical_key,
      title: practical.title,
      isRequired: practical.is_required,
      afterModuleId: practical.after_module_key
        ? (moduleIdByKey.get(practical.after_module_key) ?? null)
        : null,
    })),
    quizzes: quizzes.data.map((quiz) => ({
      key: quiz.quiz_key,
      title: quiz.title,
      isRequired: quiz.is_required,
      afterModuleId: quiz.after_module_key
        ? (moduleIdByKey.get(quiz.after_module_key) ?? null)
        : null,
    })),
    modules: orderedOutline(
      modules.data.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        summary: courseModule.summary,
        sortOrder: courseModule.sort_order,
        lessons: lessons.data
          .filter((row) => row.module_id === courseModule.id)
          .map((row) => ({
            key: row.lesson_key,
            title: row.title,
            isRequired: row.is_required,
            estimatedMinutes: row.estimated_minutes,
            sortOrder: row.sort_order,
          })),
      })),
    ),
  };
}

export type LearnerLesson = {
  /** This version's lesson row; keys stay stable across versions, ids don't. */
  id: string;
  key: string;
  title: string;
  summary: string;
  objectives: string[];
  body: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
  video: VideoRef | null;
};

/** One lesson in the course's live version, by its stable key. Null if not readable. */
export async function getLearnerLesson(
  versionId: string,
  lessonKey: string,
): Promise<LearnerLesson | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id, lesson_key, title, summary, objectives, body, is_required, estimated_minutes, video_provider, video_ref",
    )
    .eq("course_version_id", versionId)
    .eq("lesson_key", lessonKey)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the lesson", { cause: error.code });
  }
  return data
    ? {
        id: data.id,
        key: data.lesson_key,
        title: data.title,
        summary: data.summary,
        objectives: data.objectives,
        body: data.body,
        isRequired: data.is_required,
        estimatedMinutes: data.estimated_minutes,
        video: storedVideo(data.video_provider, data.video_ref),
      }
    : null;
}

/**
 * Whether the person may learn in this department: anyone in the Academy, unless the department is
 * hidden (open training, decision 2026-11-01). The database checks the same with private.can_learn.
 */
export async function canLearnIn(_userId: string, departmentId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select("status")
    .eq("id", departmentId)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the department", { cause: error.code });
  }
  return data !== null && data.status !== "inactive";
}
