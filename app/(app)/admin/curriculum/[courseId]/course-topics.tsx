"use client";

import { saveCourseTopicsAction } from "../../topics/actions";
import { TopicPicker } from "../../topics/topic-picker";

/** A course's topics (SRS-CUR-019), in the same box as a lesson's. */
export function CourseTopics({
  courseId,
  courseTitle,
  topics,
  initial,
  canAdd,
}: {
  courseId: string;
  courseTitle: string;
  topics: { id: string; name: string }[];
  initial: string[];
  canAdd: boolean;
}) {
  return (
    <TopicPicker
      topics={topics}
      initial={initial}
      canAdd={canAdd}
      save={(topicIds) => saveCourseTopicsAction({ courseId, topicIds })}
      hint="Topics help people find this course under Courses, and its lessons under Videos. They save straight away."
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-small text-text-muted">Editing a course</span>
        <span className="font-semibold">{courseTitle}</span>
      </div>
    </TopicPicker>
  );
}
