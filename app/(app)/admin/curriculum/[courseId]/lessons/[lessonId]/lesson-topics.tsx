"use client";

import { saveLessonTopicsAction } from "../../../../topics/actions";
import { TopicPicker } from "../../../../topics/topic-picker";

/** A lesson's topics, as in the Course Hierarchy mock (SRS-CUR-019). */
export function LessonTopics({
  courseId,
  lessonKey,
  lessonTitle,
  whereItLives,
  topics,
  initial,
  canAdd,
}: {
  courseId: string;
  lessonKey: string;
  lessonTitle: string;
  whereItLives: string;
  topics: { id: string; name: string }[];
  initial: string[];
  canAdd: boolean;
}) {
  return (
    <TopicPicker
      topics={topics}
      initial={initial}
      canAdd={canAdd}
      save={(topicIds) => saveLessonTopicsAction({ courseId, lessonKey, topicIds })}
      hint="Topics help people find this lesson under Explore. They save straight away."
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-small text-text-muted">Editing a lesson</span>
        <span className="font-semibold">{lessonTitle}</span>
        <span className="text-small text-text-muted">{whereItLives}</span>
      </div>
    </TopicPicker>
  );
}
