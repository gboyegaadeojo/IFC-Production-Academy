"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import {
  createTopic,
  removeTopic,
  renameTopic,
  setCourseTopics,
  setLessonTopics,
} from "@/lib/data/topics";

const id = z.uuid();
const name = z
  .string()
  .trim()
  .min(1, "Give the topic a name.")
  .max(60, "Keep it under 60 characters.");
const notAllowed: FormState = {
  status: "error",
  message: "That didn't save. Check that your role allows this, then try again.",
};

export async function createTopicAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = name.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the name." };
  }
  if (!(await getAdminAccess("topics")).allowed) {
    return notAllowed;
  }
  const result = await createTopic(parsed.data);
  if (!result.ok) {
    return notAllowed;
  }
  refresh();
  return { status: "done", message: `${parsed.data} is ready to use.` };
}

export async function renameTopicAction(_: FormState, formData: FormData): Promise<FormState> {
  const topicId = id.safeParse(formData.get("topicId"));
  const parsed = name.safeParse(formData.get("name"));
  if (!topicId.success || !parsed.success) {
    return { status: "error", message: "Give the topic a name." };
  }
  const result = await renameTopic(topicId.data, parsed.data);
  if (!result.ok) {
    return notAllowed;
  }
  refresh();
  return { status: "done", message: "Renamed." };
}

export async function removeTopicAction(_: FormState, formData: FormData): Promise<FormState> {
  const topicId = id.safeParse(formData.get("topicId"));
  if (!topicId.success) {
    return notAllowed;
  }
  const result = await removeTopic(topicId.data);
  if (!result.ok) {
    return notAllowed;
  }
  refresh();
  return { status: "done", message: "Removed from every lesson." };
}

const lessonTopics = z.object({
  courseId: z.uuid(),
  lessonKey: z.uuid(),
  topicIds: z.array(z.uuid()).max(30),
});

/** Saves a lesson's tags as soon as one changes. Returns whether it worked, for the picker. */
export async function saveLessonTopicsAction(input: {
  courseId: string;
  lessonKey: string;
  topicIds: string[];
}): Promise<boolean> {
  const parsed = lessonTopics.safeParse(input);
  if (!parsed.success) {
    return false;
  }
  const result = await setLessonTopics(
    parsed.data.courseId,
    parsed.data.lessonKey,
    parsed.data.topicIds,
  );
  return result.ok;
}

const courseTopics = z.object({ courseId: z.uuid(), topicIds: z.array(z.uuid()).max(30) });

/** Saves a course's tags as soon as one changes. Returns whether it worked, for the picker. */
export async function saveCourseTopicsAction(input: {
  courseId: string;
  topicIds: string[];
}): Promise<boolean> {
  const parsed = courseTopics.safeParse(input);
  if (!parsed.success) {
    return false;
  }
  const result = await setCourseTopics(parsed.data.courseId, parsed.data.topicIds);
  return result.ok;
}

/** Adds a topic from a lesson or course editor, and returns it so the picker can select it. */
export async function addTopicAction(raw: string): Promise<{ id: string; name: string } | null> {
  const parsed = name.safeParse(raw);
  if (!parsed.success || !(await getAdminAccess("topics")).allowed) {
    return null;
  }
  const result = await createTopic(parsed.data);
  return result.ok && result.id ? { id: result.id, name: parsed.data } : null;
}
