import "server-only";
import { listDepartmentCards, type DepartmentCard } from "@/lib/data/departments";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { orderedOutline, type OutlineModule } from "@/lib/domain/learning";

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
  /** True for members and curriculum staff: lessons are readable. */
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
  const canOpenCourses = department.state.kind === "member" || readable;

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
  const [department, level, modules, lessons] = await Promise.all([
    supabase
      .from("departments")
      .select("id, slug, name, hue, icon")
      .eq("id", course.data.department_id)
      .maybeSingle(),
    supabase.from("levels").select("number, name").eq("id", course.data.level_id).maybeSingle(),
    supabase
      .from("course_modules")
      .select("id, title, summary, sort_order")
      .eq("course_version_id", version.id),
    supabase
      .from("lessons")
      .select("lesson_key, module_id, title, is_required, estimated_minutes, sort_order")
      .eq("course_version_id", version.id),
  ]);
  if (department.error || level.error || modules.error || lessons.error) {
    throw new Error("Could not load the course", {
      cause: (department.error ?? level.error ?? modules.error ?? lessons.error)?.code,
    });
  }
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
  key: string;
  title: string;
  summary: string;
  objectives: string[];
  body: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
};

/** One lesson in the course's live version, by its stable key. Null if not readable. */
export async function getLearnerLesson(
  versionId: string,
  lessonKey: string,
): Promise<LearnerLesson | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("lesson_key, title, summary, objectives, body, is_required, estimated_minutes")
    .eq("course_version_id", versionId)
    .eq("lesson_key", lessonKey)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the lesson", { cause: error.code });
  }
  return data
    ? {
        key: data.lesson_key,
        title: data.title,
        summary: data.summary,
        objectives: data.objectives,
        body: data.body,
        isRequired: data.is_required,
        estimatedMinutes: data.estimated_minutes,
      }
    : null;
}
