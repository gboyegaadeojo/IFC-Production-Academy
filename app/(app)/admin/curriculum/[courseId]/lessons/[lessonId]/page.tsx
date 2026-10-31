import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getLesson } from "@/lib/data/curriculum";
import { mediaLibraryEnabled } from "@/lib/data/media";
import { videoInputValue, videoSource } from "@/lib/domain/video";
import { AccessDenied } from "../../../../access-denied";
import { PageSkeleton } from "../../../../page-skeleton";
import { deleteLessonAction, updateLessonAction } from "../../../actions";

export const metadata: Metadata = { title: "Lesson" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/curriculum/[courseId]/lessons/[lessonId]">;

export default function LessonPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the lesson…" />}>
      <LessonContent params={params} />
    </Suspense>
  );
}

async function LessonContent({ params }: Pick<Props, "params">) {
  const { allowed } = await getAdminAccess("curriculum");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { courseId, lessonId } = await params;
  if (!UUID.test(courseId) || !UUID.test(lessonId)) {
    notFound();
  }
  const lesson = await getLesson(lessonId);
  if (!lesson || lesson.courseId !== courseId) {
    notFound();
  }
  const libraryConnected = mediaLibraryEnabled();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href={`/admin/curriculum/${courseId}`}
          className="text-small text-accent-light underline-offset-4 hover:underline"
        >
          ← Back to the course
        </Link>
        <h1 className="text-title font-semibold">{lesson.title}</h1>
        {lesson.editable ? null : (
          <p className="rounded-button border border-border px-4 py-3 text-small text-text-secondary">
            This lesson is part of a published version, so it can&apos;t be changed. Go back to the
            course and choose Edit course to start a draft.
          </p>
        )}
      </div>

      {lesson.editable ? (
        <>
          <ActionForm
            action={updateLessonAction}
            submitLabel="Save lesson"
            hidden={{ lessonId: lesson.id }}
          >
            <Field id="lesson-title" label="Title">
              <input
                id="lesson-title"
                name="title"
                required
                maxLength={120}
                defaultValue={lesson.title}
                className={fieldClasses}
              />
            </Field>
            <Field id="lesson-module" label="Module">
              <select
                id="lesson-module"
                name="moduleId"
                defaultValue={lesson.moduleId}
                className={fieldClasses}
              >
                {lesson.modules.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="lesson-summary"
              label="Summary"
              hint="What this lesson covers, in a sentence or two."
            >
              <textarea
                id="lesson-summary"
                name="summary"
                rows={2}
                maxLength={1000}
                defaultValue={lesson.summary}
                aria-describedby="lesson-summary-hint"
                className={`${fieldClasses} py-3`}
              />
            </Field>
            <Field id="lesson-objectives" label="Objectives" hint="One per line.">
              <textarea
                id="lesson-objectives"
                name="objectives"
                rows={3}
                defaultValue={lesson.objectives.join("\n")}
                aria-describedby="lesson-objectives-hint"
                className={`${fieldClasses} py-3`}
              />
            </Field>
            <Field id="lesson-minutes" label="Estimated minutes (optional)">
              <input
                id="lesson-minutes"
                name="estimatedMinutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                defaultValue={lesson.estimatedMinutes ?? ""}
                className={`${fieldClasses} w-32`}
              />
            </Field>
            <label className="flex min-h-control items-center gap-3">
              <input
                type="checkbox"
                name="isRequired"
                defaultChecked={lesson.isRequired}
                className="size-5 accent-[var(--accent)]"
              />
              Required to complete the course
            </label>
            <fieldset className="flex flex-col gap-4 rounded-card border border-border p-4">
              <legend className="px-1 text-small font-medium text-text-secondary">
                Video (optional)
              </legend>
              <Field id="lesson-video-source" label="Where the video lives">
                <select
                  id="lesson-video-source"
                  name="videoProvider"
                  defaultValue={lesson.video?.provider ?? "youtube"}
                  className={fieldClasses}
                >
                  <option value="youtube">YouTube (unlisted)</option>
                  <option value="nas">
                    Church video library{libraryConnected ? "" : " (not connected yet)"}
                  </option>
                </select>
              </Field>
              <Field
                id="lesson-video"
                label="Video link or file"
                hint="YouTube: paste the link from the Share button. Use Unlisted, not Private, because Private videos won't play for volunteers. Anyone with an unlisted link can watch it, so keep sensitive material out of YouTube. Church video library: the file's path inside the training videos folder, like camera/level-1/framing.mp4. Library videos play only for signed-in members."
              >
                <input
                  id="lesson-video"
                  name="video"
                  type="text"
                  inputMode="url"
                  maxLength={500}
                  defaultValue={lesson.video ? videoInputValue(lesson.video) : ""}
                  aria-describedby="lesson-video-hint"
                  className={fieldClasses}
                />
              </Field>
              {libraryConnected ? null : (
                <p className="text-small text-text-muted">
                  The church video library isn&apos;t connected yet. You can add library files now;
                  lessons will say the video isn&apos;t available until it&apos;s connected.
                </p>
              )}
            </fieldset>
            <Field
              id="lesson-body"
              label="Lesson text"
              hint="Steps, tips, and notes. SOP attachments come in a later update."
            >
              <textarea
                id="lesson-body"
                name="body"
                rows={12}
                maxLength={20000}
                defaultValue={lesson.body}
                aria-describedby="lesson-body-hint"
                className={`${fieldClasses} py-3`}
              />
            </Field>
          </ActionForm>

          <details className="rounded-card border border-border bg-card p-5">
            <summary className="flex min-h-control cursor-pointer items-center font-semibold">
              Remove this lesson
            </summary>
            <p className="mt-2 text-text-secondary">
              It&apos;s removed from this draft only. Published versions keep it.
            </p>
            <div className="mt-3">
              <ActionForm
                action={deleteLessonAction}
                submitLabel="Remove lesson"
                pendingLabel="Removing…"
                variant="destructive"
                hidden={{ lessonId: lesson.id, courseId }}
              />
            </div>
          </details>
        </>
      ) : (
        <article className="flex flex-col gap-4 rounded-card border border-border bg-card p-5">
          {lesson.summary ? <p className="text-text-secondary">{lesson.summary}</p> : null}
          {lesson.video ? (
            <p className="text-small text-text-muted">
              Has a {videoSource(lesson.video.provider).label} video.
            </p>
          ) : null}
          {lesson.objectives.length > 0 ? (
            <ul className="list-disc pl-5">
              {lesson.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          ) : null}
          <p className="whitespace-pre-line">{lesson.body}</p>
        </article>
      )}
    </div>
  );
}
