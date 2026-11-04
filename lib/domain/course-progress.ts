/**
 * Course progress for leaders (ADD-REPORT-02): who has finished a course, who's partway, and who
 * hasn't started. Lessons are ones the learner marked complete, and nothing here claims a video was
 * watched (SRS-LESSON-006). A finished course is separate from being Approved to Serve (SPEC §3).
 */
import type { QuizResult } from "./quiz-results";
import type { CourseReportState } from "./reports";

export type ProgressStatus = "finished" | "in_progress" | "not_started";

export function progressStatus(state: CourseReportState): ProgressStatus {
  if (state === "completed") {
    return "finished";
  }
  return state === "not_started" ? "not_started" : "in_progress";
}

export type PersonProgress = {
  userId: string;
  name: string;
  status: ProgressStatus;
  /** Keys of the lessons this person has marked complete. */
  completedLessons: string[];
  quizzes: QuizResult[];
  /** Keys of the practicals this person has passed. */
  passedPracticals: string[];
};

export type CourseProgressView = {
  courseId: string;
  courseTitle: string;
  level: number | null;
  lessons: { key: string; title: string }[];
  quizzes: { key: string; title: string }[];
  practicals: { key: string; title: string }[];
  people: PersonProgress[];
};

export function statusCounts(people: readonly PersonProgress[]): Record<ProgressStatus, number> {
  const counts: Record<ProgressStatus, number> = { finished: 0, in_progress: 0, not_started: 0 };
  for (const person of people) {
    counts[person.status] += 1;
  }
  return counts;
}

/** Finished lessons only count if they're in this course's live version. */
export function lessonsDone(
  person: PersonProgress,
  view: Pick<CourseProgressView, "lessons">,
): number {
  return view.lessons.filter((lesson) => person.completedLessons.includes(lesson.key)).length;
}

export function lessonPercent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** The first lesson not yet marked complete, so a leader can see where someone is. */
export function nextLessonKey(
  person: PersonProgress,
  view: Pick<CourseProgressView, "lessons">,
): string | null {
  return view.lessons.find((lesson) => !person.completedLessons.includes(lesson.key))?.key ?? null;
}
