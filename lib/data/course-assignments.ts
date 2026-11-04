import "server-only";
import { cache } from "react";
import { getPublishedCourseCards, type StartHereCourse } from "@/lib/data/library";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { AssignablePerson } from "@/lib/domain/course-progress";

// Assigning a course (ADD-REPORT-03). The database checks course.assign, and writes the audit event.
// An assignment is a request: it never blocks anything or adds anyone to a team.

export async function getAssignablePeople(courseId: string): Promise<AssignablePerson[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("assignable_people", { p_course_id: courseId });
  if (error) {
    throw new Error("Could not load people", { cause: error.code });
  }
  return data.map((row) => ({ userId: row.user_id, name: row.display_name }));
}

export async function assignCourse(courseId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_course", {
    p_course_id: courseId,
    p_user_id: userId,
  });
  return !error;
}

export async function removeCourseAssignment(courseId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_course_assignment", {
    p_course_id: courseId,
    p_user_id: userId,
  });
  return !error;
}

/**
 * Courses this person was asked to take and hasn't finished, oldest first, for Training. One read
 * when there are none, as most people's Training pages will be.
 */
export const getMyAssignedCourses = cache(async (userId: string): Promise<StartHereCourse[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("course_assignments")
    .select("course_id")
    .eq("user_id", userId)
    .is("removed_at", null)
    .order("assigned_at");
  if (error) {
    throw new Error("Could not load your assigned courses", { cause: error.code });
  }
  if (data.length === 0) {
    return [];
  }
  const cards = await getPublishedCourseCards(
    userId,
    data.map((row) => row.course_id),
  );
  return cards.filter((course) => course.state !== "completed");
});
