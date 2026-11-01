import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { peopleById, personFor, type PersonSummary } from "@/lib/data/admin/shared";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import { storedVideo, type VideoRef } from "@/lib/domain/video";
import { getVersionPracticals, type PracticalDetail } from "@/lib/data/practicals";
import { getVersionQuizzes, type QuizOutline } from "@/lib/data/quizzes";
import {
  courseState,
  nextSortOrder,
  reorder,
  toCurriculumError,
  type CourseState,
  type CourseVersionStatus,
  type CurriculumError,
} from "@/lib/domain/curriculum";

export type CurriculumResult = { ok: true } | { ok: false; error: CurriculumError };
type WithId<T> = { ok: true; id: T } | { ok: false; error: CurriculumError };

function fail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: CurriculumError;
} {
  return { ok: false, error: toCurriculumError(error) };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type CurriculumOverview = {
  id: string;
  name: string;
  hue: string;
  icon: string;
  canDraft: boolean;
  levels: {
    id: string;
    number: number;
    name: string;
    courses: { id: string; state: CourseState }[];
  }[];
}[];

/** Departments the person looks after, with their levels and courses (SRS-CUR-002). */
export async function getCurriculumOverview(
  grants: readonly CapabilityGrant[],
): Promise<CurriculumOverview> {
  const supabase = await createSupabaseServerClient();
  const departments = await supabase
    .from("departments")
    .select("id, name, hue, icon, sort_order")
    .order("sort_order");
  if (departments.error) {
    throw new Error("Could not load departments", { cause: departments.error.code });
  }
  const managed = departments.data.filter(
    (d) =>
      hasCapability(grants, "course.draft", d.id) || hasCapability(grants, "course.publish", d.id),
  );
  const ids = managed.map((d) => d.id);
  if (ids.length === 0) {
    return [];
  }

  const [levels, courses] = await Promise.all([
    supabase
      .from("levels")
      .select("id, department_id, number, name")
      .in("department_id", ids)
      .order("number"),
    supabase
      .from("courses")
      .select("id, level_id, sort_order, archived_at")
      .in("department_id", ids)
      .order("sort_order"),
  ]);
  if (levels.error || courses.error) {
    throw new Error("Could not load the curriculum", {
      cause: (levels.error ?? courses.error)?.code,
    });
  }
  const versions = courses.data.length
    ? await supabase
        .from("course_versions")
        .select("id, course_id, status, version_number, title")
        .in(
          "course_id",
          courses.data.map((c) => c.id),
        )
    : { data: [], error: null };
  if (versions.error) {
    throw new Error("Could not load course versions", { cause: versions.error.code });
  }

  return managed.map((department) => ({
    id: department.id,
    name: department.name,
    hue: department.hue,
    icon: department.icon,
    canDraft: hasCapability(grants, "course.draft", department.id),
    levels: levels.data
      .filter((level) => level.department_id === department.id)
      .map((level) => ({
        id: level.id,
        number: level.number,
        name: level.name,
        courses: courses.data
          .filter((course) => course.level_id === level.id)
          .flatMap((course) => {
            const state = courseState(
              versions.data
                .filter((v) => v.course_id === course.id)
                .map((v) => ({
                  id: v.id,
                  status: v.status,
                  versionNumber: v.version_number,
                  title: v.title,
                })),
              course.archived_at !== null,
            );
            return state ? [{ id: course.id, state }] : [];
          }),
      })),
  }));
}

// ---------------------------------------------------------------------------
// One course
// ---------------------------------------------------------------------------

export type LessonOutline = {
  id: string;
  title: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
  sortOrder: number;
};

export type ModuleOutline = {
  id: string;
  /** Stable across versions; quizzes are placed after a module by this key. */
  key: string;
  title: string;
  summary: string;
  sortOrder: number;
  lessons: LessonOutline[];
};

export type VersionDetail = {
  id: string;
  status: CourseVersionStatus;
  versionNumber: number | null;
  title: string;
  summary: string;
  objectives: string[];
  estimatedMinutes: number | null;
  changeNote: string | null;
  submittedBy: string | null;
  modules: ModuleOutline[];
  quizzes: QuizOutline[];
  practicals: PracticalDetail[];
};

export type VersionHistoryEntry = {
  id: string;
  status: CourseVersionStatus;
  versionNumber: number;
  title: string;
  changeNote: string | null;
  publishedAt: string;
  publishedBy: PersonSummary | null;
};

export type CourseEditor = {
  id: string;
  departmentId: string;
  departmentName: string;
  levelName: string;
  requiresReview: boolean;
  archived: boolean;
  /** The draft or version in review, if any; otherwise null. */
  open: VersionDetail | null;
  /** The live version, if any. */
  live: VersionDetail | null;
  history: VersionHistoryEntry[];
};

async function loadVersionDetail(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  version: {
    id: string;
    status: CourseVersionStatus;
    version_number: number | null;
    title: string;
    summary: string;
    objectives: string[];
    estimated_minutes: number | null;
    change_note: string | null;
    submitted_by: string | null;
  },
): Promise<VersionDetail> {
  const [modules, lessons, quizzes, practicals] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id, module_key, title, summary, sort_order")
      .eq("course_version_id", version.id)
      .order("sort_order"),
    supabase
      .from("lessons")
      .select("id, module_id, title, is_required, estimated_minutes, sort_order")
      .eq("course_version_id", version.id)
      .order("sort_order"),
    getVersionQuizzes(version.id),
    getVersionPracticals(version.id),
  ]);
  if (modules.error || lessons.error) {
    throw new Error("Could not load course content", {
      cause: (modules.error ?? lessons.error)?.code,
    });
  }
  return {
    id: version.id,
    status: version.status,
    versionNumber: version.version_number,
    title: version.title,
    summary: version.summary,
    objectives: version.objectives,
    estimatedMinutes: version.estimated_minutes,
    changeNote: version.change_note,
    submittedBy: version.submitted_by,
    quizzes,
    practicals,
    modules: modules.data.map((module) => ({
      id: module.id,
      key: module.module_key,
      title: module.title,
      summary: module.summary,
      sortOrder: module.sort_order,
      lessons: lessons.data
        .filter((lesson) => lesson.module_id === module.id)
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          isRequired: lesson.is_required,
          estimatedMinutes: lesson.estimated_minutes,
          sortOrder: lesson.sort_order,
        })),
    })),
  };
}

export async function getCourseEditor(courseId: string): Promise<CourseEditor | null> {
  const supabase = await createSupabaseServerClient();
  const course = await supabase
    .from("courses")
    .select("id, department_id, level_id, archived_at")
    .eq("id", courseId)
    .maybeSingle();
  if (course.error) {
    throw new Error("Could not load the course", { cause: course.error.code });
  }
  if (!course.data) {
    return null;
  }
  const [department, level, versions] = await Promise.all([
    supabase
      .from("departments")
      .select("name, curriculum_requires_review")
      .eq("id", course.data.department_id)
      .single(),
    supabase.from("levels").select("number, name").eq("id", course.data.level_id).single(),
    supabase
      .from("course_versions")
      .select(
        "id, status, version_number, title, summary, objectives, estimated_minutes, change_note, submitted_by, published_at, published_by",
      )
      .eq("course_id", courseId)
      .order("version_number", { ascending: false, nullsFirst: true }),
  ]);
  if (department.error || level.error || versions.error) {
    throw new Error("Could not load the course", {
      cause: (department.error ?? level.error ?? versions.error)?.code,
    });
  }

  const openRow = versions.data.find((v) => v.status === "draft" || v.status === "pending_review");
  const liveRow = versions.data.find((v) => v.status === "published");
  const historyRows = versions.data.filter(
    (v): v is typeof v & { version_number: number; published_at: string } =>
      v.version_number !== null && v.published_at !== null,
  );
  const people = await peopleById(
    supabase,
    historyRows.flatMap((v) => (v.published_by ? [v.published_by] : [])),
  );

  return {
    id: course.data.id,
    departmentId: course.data.department_id,
    departmentName: department.data.name,
    levelName: `Level ${level.data.number}: ${level.data.name}`,
    requiresReview: department.data.curriculum_requires_review,
    archived: course.data.archived_at !== null,
    open: openRow ? await loadVersionDetail(supabase, openRow) : null,
    live: liveRow ? await loadVersionDetail(supabase, liveRow) : null,
    history: historyRows.map((v) => ({
      id: v.id,
      status: v.status,
      versionNumber: v.version_number,
      title: v.title,
      changeNote: v.change_note,
      publishedAt: v.published_at,
      publishedBy: v.published_by ? personFor(people, v.published_by) : null,
    })),
  };
}

export type LessonDetail = {
  id: string;
  courseId: string;
  departmentId: string;
  courseVersionId: string;
  editable: boolean;
  moduleId: string;
  title: string;
  summary: string;
  objectives: string[];
  estimatedMinutes: number | null;
  isRequired: boolean;
  body: string;
  video: VideoRef | null;
  modules: { id: string; title: string }[];
};

export async function getLesson(lessonId: string): Promise<LessonDetail | null> {
  const supabase = await createSupabaseServerClient();
  const lesson = await supabase
    .from("lessons")
    .select(
      "id, course_version_id, module_id, title, summary, objectives, estimated_minutes, is_required, body, video_provider, video_ref",
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (lesson.error) {
    throw new Error("Could not load the lesson", { cause: lesson.error.code });
  }
  if (!lesson.data) {
    return null;
  }
  const [version, modules] = await Promise.all([
    supabase
      .from("course_versions")
      .select("course_id, status")
      .eq("id", lesson.data.course_version_id)
      .single(),
    supabase
      .from("course_modules")
      .select("id, title")
      .eq("course_version_id", lesson.data.course_version_id)
      .order("sort_order"),
  ]);
  if (version.error || modules.error) {
    throw new Error("Could not load the lesson", { cause: (version.error ?? modules.error)?.code });
  }
  const course = await supabase
    .from("courses")
    .select("department_id")
    .eq("id", version.data.course_id)
    .single();
  if (course.error) {
    throw new Error("Could not load the lesson", { cause: course.error.code });
  }
  return {
    id: lesson.data.id,
    courseId: version.data.course_id,
    departmentId: course.data.department_id,
    courseVersionId: lesson.data.course_version_id,
    editable: version.data.status === "draft",
    moduleId: lesson.data.module_id,
    title: lesson.data.title,
    summary: lesson.data.summary,
    objectives: lesson.data.objectives,
    estimatedMinutes: lesson.data.estimated_minutes,
    isRequired: lesson.data.is_required,
    body: lesson.data.body,
    video: storedVideo(lesson.data.video_provider, lesson.data.video_ref),
    modules: modules.data,
  };
}

// ---------------------------------------------------------------------------
// Changes. The database checks every one (RLS on drafts, functions for the lifecycle).
// ---------------------------------------------------------------------------

export async function createCourse(levelId: string, title: string): Promise<WithId<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_course", {
    p_level_id: levelId,
    p_title: title,
  });
  return error ? fail(error) : { ok: true, id: data };
}

export async function startCourseDraft(courseId: string): Promise<WithId<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_course_draft", { p_course_id: courseId });
  return error ? fail(error) : { ok: true, id: data };
}

/** An update that RLS filtered out returns no rows, so treat that as not authorized. */
function updated(result: {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}) {
  if (result.error) {
    return fail(result.error);
  }
  return (result.data?.length ?? 0) > 0 ? ({ ok: true } as const) : fail({ code: "42501" });
}

export async function updateCourseDetails(
  versionId: string,
  details: { title: string; summary: string; objectives: string[]; estimatedMinutes?: number },
): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("course_versions")
      .update({
        title: details.title,
        summary: details.summary,
        objectives: details.objectives,
        estimated_minutes: details.estimatedMinutes ?? null,
      })
      .eq("id", versionId)
      .select("id"),
  );
}

export async function addModule(
  versionId: string,
  module: { title: string; summary: string; sortOrder: number },
): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("course_modules").insert({
    course_version_id: versionId,
    title: module.title,
    summary: module.summary,
    sort_order: module.sortOrder,
  });
  return error ? fail(error) : { ok: true };
}

export async function updateModule(
  moduleId: string,
  module: { title: string; summary: string },
): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("course_modules")
      .update({ title: module.title, summary: module.summary })
      .eq("id", moduleId)
      .select("id"),
  );
}

export async function deleteModule(moduleId: string): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_course_module", { p_module_id: moduleId });
  return error ? fail(error) : { ok: true };
}

/** Moves a module or lesson one place up or down among its siblings. */
export async function moveItem(
  table: "course_modules" | "lessons",
  id: string,
  direction: "up" | "down",
): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  let siblings: { id: string; sort_order: number }[];
  if (table === "course_modules") {
    const item = await supabase
      .from("course_modules")
      .select("course_version_id")
      .eq("id", id)
      .maybeSingle();
    if (item.error || !item.data) {
      return fail(item.error ?? { code: "42501" });
    }
    const all = await supabase
      .from("course_modules")
      .select("id, sort_order")
      .eq("course_version_id", item.data.course_version_id);
    if (all.error) {
      return fail(all.error);
    }
    siblings = all.data;
  } else {
    const item = await supabase.from("lessons").select("module_id").eq("id", id).maybeSingle();
    if (item.error || !item.data) {
      return fail(item.error ?? { code: "42501" });
    }
    const all = await supabase
      .from("lessons")
      .select("id, sort_order")
      .eq("module_id", item.data.module_id);
    if (all.error) {
      return fail(all.error);
    }
    siblings = all.data;
  }
  const changes = reorder(
    siblings.map((s) => ({ id: s.id, sortOrder: s.sort_order })),
    id,
    direction,
  );
  return setSortOrders(table, changes);
}

/** The next free sort order in a module, for a new lesson. */
export async function nextLessonSortOrder(moduleId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("lessons").select("sort_order").eq("module_id", moduleId);
  return nextSortOrder((data ?? []).map((row) => ({ sortOrder: row.sort_order })));
}

/** The next free sort order in a version, for a new module. */
export async function nextModuleSortOrder(versionId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("course_modules")
    .select("sort_order")
    .eq("course_version_id", versionId);
  return nextSortOrder((data ?? []).map((row) => ({ sortOrder: row.sort_order })));
}

async function setSortOrders(
  table: "course_modules" | "lessons",
  changes: { id: string; sortOrder: number }[],
): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  for (const change of changes) {
    const result = updated(
      await supabase
        .from(table)
        .update({ sort_order: change.sortOrder })
        .eq("id", change.id)
        .select("id"),
    );
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

export async function addLesson(
  versionId: string,
  moduleId: string,
  title: string,
  sortOrder: number,
): Promise<WithId<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("lessons")
    .insert({ course_version_id: versionId, module_id: moduleId, title, sort_order: sortOrder })
    .select("id")
    .single();
  return error ? fail(error) : { ok: true, id: data.id };
}

export async function updateLesson(
  lessonId: string,
  lesson: {
    moduleId: string;
    title: string;
    summary: string;
    objectives: string[];
    estimatedMinutes?: number;
    isRequired: boolean;
    body: string;
    video: VideoRef | null;
  },
): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("lessons")
      .update({
        module_id: lesson.moduleId,
        title: lesson.title,
        summary: lesson.summary,
        objectives: lesson.objectives,
        estimated_minutes: lesson.estimatedMinutes ?? null,
        is_required: lesson.isRequired,
        body: lesson.body,
        video_provider: lesson.video?.provider ?? null,
        video_ref: lesson.video?.id ?? null,
      })
      .eq("id", lessonId)
      .select("id"),
  );
}

export async function deleteLesson(lessonId: string): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_lesson", { p_lesson_id: lessonId });
  return error ? fail(error) : { ok: true };
}

export async function publishVersion(
  versionId: string,
  changeNote: string | null,
): Promise<WithId<number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("publish_course_version", {
    p_version_id: versionId,
    p_change_note: changeNote,
  });
  return error ? fail(error) : { ok: true, id: data };
}

export async function submitVersion(
  versionId: string,
  changeNote: string,
): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_course_version", {
    p_version_id: versionId,
    p_change_note: changeNote,
  });
  return error ? fail(error) : { ok: true };
}

export async function returnVersion(versionId: string, reason: string): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("return_course_version", {
    p_version_id: versionId,
    p_reason: reason,
  });
  return error ? fail(error) : { ok: true };
}

export async function restoreVersion(versionId: string): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("restore_course_version", { p_version_id: versionId });
  return error ? fail(error) : { ok: true };
}

/** Deletes a course that was never published (taken out of the curriculum; audited). */
export async function discardDraftCourse(courseId: string): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("discard_draft_course", { p_course_id: courseId });
  return error ? fail(error) : { ok: true };
}

export async function archiveCourse(courseId: string): Promise<CurriculumResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_course", { p_course_id: courseId });
  return error ? fail(error) : { ok: true };
}
