import { notFound, redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/data/auth";
import { getLearnerCourse } from "@/lib/data/pathway";
import { getCourseProgressById } from "@/lib/data/progress";
import { courseSteps, stepHref } from "@/lib/domain/learning";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opening a course from a poster goes straight to what's next, or to the overview once it's
 * finished (Course Hierarchy mock, approved 2026-11-04). Worked out here, on the click, because the
 * pages that list courses can't afford every course's outline.
 */
export default async function OpenCoursePage({ params }: PageProps<"/courses/[courseId]/open">) {
  const user = await requireActiveUser();
  const { courseId } = await params;
  if (!UUID.test(courseId)) {
    notFound();
  }
  const course = await getLearnerCourse(courseId);
  if (!course) {
    notFound();
  }
  const progress = (await getCourseProgressById(user.id, [courseId])).get(courseId);
  const step =
    progress?.state === "completed"
      ? null
      : (progress?.next ?? courseSteps(course.modules, course.quizzes, course.practicals)[0]);
  redirect(course.canOpen && step ? stepHref(courseId, step) : `/courses/${courseId}`);
}
