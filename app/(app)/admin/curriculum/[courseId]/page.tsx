import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCourseEditor, type ModuleOutline, type VersionDetail } from "@/lib/data/curriculum";
import { formatDateTime } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import { VERSION_STATUS_LABELS } from "@/lib/domain/curriculum";
import { rulesLabel } from "@/lib/domain/quiz";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import {
  addLessonAction,
  addModuleAction,
  archiveAction,
  deleteModuleAction,
  moveAction,
  publishAction,
  restoreAction,
  returnAction,
  startDraftAction,
  submitAction,
  updateCourseDetailsAction,
  updateModuleAction,
} from "../actions";
import { addQuizAction } from "../quiz-actions";

export const metadata: Metadata = { title: "Course" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CoursePage({
  params,
  searchParams,
}: PageProps<"/admin/curriculum/[courseId]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the course…" />}>
      <CourseContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const TABS = ["lessons", "quizzes", "details", "publish", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  lessons: "Lessons",
  quizzes: "Quizzes",
  details: "Details",
  publish: "Publish",
  history: "History",
};

/**
 * Course authoring workspace (DESIGN §7.5): a persistent header with live and draft status, then
 * Lessons, Quizzes, Details, Publish, and History. Practical assessments and Resources join when
 * those features exist.
 * Drafting, publishing, review, restore, and archive rules are unchanged (SRS-CUR-001..008).
 */
async function CourseContent({
  params,
  searchParams,
}: Pick<PageProps<"/admin/curriculum/[courseId]">, "params" | "searchParams">) {
  const { user, grants, allowed } = await getAdminAccess("curriculum");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { courseId } = await params;
  if (!UUID.test(courseId)) {
    notFound();
  }
  const course = await getCourseEditor(courseId);
  if (!course) {
    notFound();
  }
  const query = await searchParams;
  const tab: Tab = TABS.find((candidate) => candidate === query.tab) ?? "lessons";
  const canDraft = hasCapability(grants, "course.draft", course.departmentId);
  const canPublish = hasCapability(grants, "course.publish", course.departmentId);
  const draft = course.open?.status === "draft" ? course.open : null;
  const inReview = course.open?.status === "pending_review" ? course.open : null;
  const shown = course.open ?? course.live;
  const title = shown?.title ?? "Untitled course";
  const tabHref = (next: Tab) =>
    next === "lessons"
      ? `/admin/curriculum/${course.id}`
      : `/admin/curriculum/${course.id}?tab=${next}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Breadcrumbs
          items={[
            { label: "Curriculum", href: `/admin/curriculum?department=${course.departmentId}` },
            {
              label: course.departmentName,
              href: `/admin/curriculum?department=${course.departmentId}`,
            },
            { label: title },
          ]}
        />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">{course.levelName}</p>
            <h1 className="text-title font-semibold">{title}</h1>
            <div className="flex flex-wrap gap-2">
              {course.archived ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
              {course.live ? (
                <StatusBadge tone="success">
                  Version {course.live.versionNumber} is live
                </StatusBadge>
              ) : (
                <StatusBadge tone="pending">Not published yet</StatusBadge>
              )}
              {draft ? <StatusBadge tone="pending">You&apos;re editing a draft</StatusBadge> : null}
              {inReview ? <StatusBadge tone="pending">Waiting for review</StatusBadge> : null}
            </div>
          </div>
          <div className="flex flex-col gap-1 lg:items-end">
            {!course.open && canDraft ? (
              <>
                <ActionForm
                  action={startDraftAction}
                  submitLabel="Edit course"
                  pendingLabel="Starting a draft…"
                  hidden={{ courseId: course.id }}
                  className="flex flex-col gap-2 lg:items-end"
                />
                <p className="text-small text-text-muted">
                  Starts a draft. Volunteers keep seeing the live version until you publish.
                </p>
              </>
            ) : null}
            {draft && tab !== "publish" ? (
              <Link href={tabHref("publish")} className={buttonClasses("secondary")}>
                {course.requiresReview ? "Submit for review" : "Review and publish"}
              </Link>
            ) : null}
          </div>
        </div>
        {course.requiresReview ? (
          <p className="text-small text-text-muted">
            This department asks for a second person to publish changes.
          </p>
        ) : null}
      </header>

      <Tabs
        label="Course sections"
        tabs={TABS.map((key) => ({
          href: tabHref(key),
          label: TAB_LABELS[key],
          current: key === tab,
        }))}
      />

      {tab === "lessons" ? (
        draft && canDraft ? (
          <DraftEditor courseId={course.id} draft={draft} part="content" />
        ) : shown ? (
          <ReadOnlyOutline courseId={course.id} version={shown} />
        ) : (
          <EmptyState title="No content yet">Start editing to add modules and lessons.</EmptyState>
        )
      ) : null}

      {tab === "quizzes" ? (
        shown ? (
          <QuizzesPanel
            courseId={course.id}
            version={draft && canDraft ? draft : shown}
            editable={Boolean(draft && canDraft)}
          />
        ) : (
          <EmptyState title="No content yet">Start editing to add quizzes.</EmptyState>
        )
      ) : null}

      {tab === "details" ? (
        draft && canDraft ? (
          <DraftEditor courseId={course.id} draft={draft} part="details" />
        ) : shown ? (
          <section aria-labelledby="details-heading" className="flex reading-width flex-col gap-4">
            <h2 id="details-heading" className="text-heading font-semibold">
              Course details
            </h2>
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-small text-text-muted">Summary</dt>
                <dd>{shown.summary || "No summary yet."}</dd>
              </div>
              <div>
                <dt className="text-small text-text-muted">Objectives</dt>
                <dd>
                  {shown.objectives.length === 0 ? (
                    "None listed."
                  ) : (
                    <ul className="list-disc pl-5">
                      {shown.objectives.map((objective) => (
                        <li key={objective}>{objective}</li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
            <p className="text-small text-text-muted">
              Published details can&apos;t be changed. Choose Edit course to start a draft.
            </p>
          </section>
        ) : null
      ) : null}

      {tab === "publish" ? (
        <div className="flex flex-col gap-6">
          {draft ? (
            <PublishPanel
              versionId={draft.id}
              requiresReview={course.requiresReview}
              canPublish={canPublish}
              canDraft={canDraft}
            />
          ) : null}
          {inReview ? (
            <section className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5">
              <h2 className="text-subheading font-semibold">Waiting for review</h2>
              {inReview.changeNote ? (
                <p className="text-text-secondary">Change note: {inReview.changeNote}</p>
              ) : null}
              {canPublish && inReview.submittedBy !== user.id ? (
                <>
                  <ActionForm
                    action={publishAction}
                    submitLabel="Publish"
                    pendingLabel="Publishing…"
                    hidden={{ versionId: inReview.id, inReview: "true", changeNote: "" }}
                  />
                  <ActionForm
                    action={returnAction}
                    submitLabel="Return for changes"
                    variant="secondary"
                    hidden={{ versionId: inReview.id }}
                  >
                    <Field id="return-reason" label="What needs changing (optional)">
                      <input
                        id="return-reason"
                        name="reason"
                        maxLength={300}
                        className={fieldClasses}
                      />
                    </Field>
                  </ActionForm>
                </>
              ) : (
                <p className="text-text-secondary">
                  Someone else with publishing rights for {course.departmentName} needs to publish
                  it.
                </p>
              )}
            </section>
          ) : null}
          {!course.open ? (
            <EmptyState title="Nothing waiting to publish">
              {course.live
                ? "The live version is up to date. Choose Edit course to start the next one."
                : "Add content, then publish the first version."}
            </EmptyState>
          ) : null}
          {canPublish && course.live && !course.archived ? (
            <details className="max-w-2xl rounded-card border border-border p-5">
              <summary className="flex min-h-control cursor-pointer items-center font-medium">
                Archive this course
              </summary>
              <p className="mt-2 text-text-secondary">
                Volunteers stop seeing it. Its versions and everyone&apos;s history are kept, and
                you can bring it back by editing and publishing again.
              </p>
              <div className="mt-3">
                <ActionForm
                  action={archiveAction}
                  submitLabel="Archive course"
                  pendingLabel="Archiving…"
                  variant="destructive"
                  hidden={{ courseId: course.id }}
                />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {tab === "history" ? (
        <section aria-labelledby="history-heading" className="flex flex-col gap-4">
          <h2 id="history-heading" className="text-heading font-semibold">
            Version history
          </h2>
          {course.history.length === 0 ? (
            <EmptyState title="Nothing published yet">
              Each publish is kept here with its change note, so you can see what changed and
              restore an earlier version.
            </EmptyState>
          ) : (
            <ol className="divide-y divide-border rounded-card border border-border">
              {course.history.map((version) => (
                <li
                  key={version.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">
                      Version {version.versionNumber}: {version.title}
                    </p>
                    {version.changeNote ? (
                      <p className="text-small whitespace-pre-line text-text-secondary">
                        {version.changeNote}
                      </p>
                    ) : null}
                    <p className="text-small text-text-muted">
                      Published {formatDateTime(version.publishedAt)}
                      {version.publishedBy ? ` by ${version.publishedBy.displayName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <StatusBadge tone={version.status === "published" ? "success" : "neutral"}>
                      {VERSION_STATUS_LABELS[version.status]}
                    </StatusBadge>
                    {canDraft && !course.open && version.status !== "published" ? (
                      <ActionForm
                        action={restoreAction}
                        submitLabel="Restore as draft"
                        pendingLabel="Restoring…"
                        variant="tertiary"
                        hidden={{ versionId: version.id }}
                        srLabel={`version ${version.versionNumber}`}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
function DraftEditor({
  courseId,
  draft,
  part,
}: {
  courseId: string;
  draft: VersionDetail;
  part: "details" | "content";
}) {
  return (
    <>
      {part === "details" ? (
        <section
          aria-labelledby="details-heading"
          className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
        >
          <h2 id="details-heading" className="text-subheading font-semibold">
            Course details
          </h2>
          <ActionForm
            action={updateCourseDetailsAction}
            submitLabel="Save details"
            hidden={{ versionId: draft.id }}
          >
            <Field id="course-title" label="Title">
              <input
                id="course-title"
                name="title"
                required
                maxLength={120}
                defaultValue={draft.title}
                className={fieldClasses}
              />
            </Field>
            <Field
              id="course-summary"
              label="Summary"
              hint="One or two sentences volunteers see first."
            >
              <textarea
                id="course-summary"
                name="summary"
                rows={3}
                maxLength={1000}
                defaultValue={draft.summary}
                aria-describedby="course-summary-hint"
                className={`${fieldClasses} py-3`}
              />
            </Field>
            <Field
              id="course-objectives"
              label="Objectives"
              hint="One per line. What will volunteers be able to do?"
            >
              <textarea
                id="course-objectives"
                name="objectives"
                rows={4}
                defaultValue={draft.objectives.join("\n")}
                aria-describedby="course-objectives-hint"
                className={`${fieldClasses} py-3`}
              />
            </Field>
            <Field id="course-minutes" label="Estimated minutes (optional)">
              <input
                id="course-minutes"
                name="estimatedMinutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={6000}
                defaultValue={draft.estimatedMinutes ?? ""}
                className={`${fieldClasses} w-32`}
              />
            </Field>
          </ActionForm>
        </section>
      ) : null}

      {part === "content" ? (
        <section aria-labelledby="outline-heading" className="flex flex-col gap-4">
          <h2 id="outline-heading" className="text-heading font-semibold">
            Modules and lessons
          </h2>
          {draft.modules.length === 0 ? (
            <p className="text-text-secondary">Add a module, then add lessons to it.</p>
          ) : null}
          {draft.modules.map((courseModule, index) => (
            <ModuleEditor
              key={courseModule.id}
              courseId={courseId}
              versionId={draft.id}
              courseModule={courseModule}
              isFirst={index === 0}
              isLast={index === draft.modules.length - 1}
            />
          ))}
          <div className="max-w-2xl rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={addModuleAction}
              submitLabel="Add module"
              pendingLabel="Adding…"
              variant="secondary"
              hidden={{ versionId: draft.id }}
              className="flex flex-col gap-3"
            >
              <Field id="new-module" label="New module title">
                <input
                  id="new-module"
                  name="title"
                  required
                  maxLength={120}
                  className={fieldClasses}
                />
              </Field>
            </ActionForm>
          </div>
        </section>
      ) : null}
    </>
  );
}

function MoveButtons({
  kind,
  itemId,
  label,
  isFirst,
  isLast,
}: {
  kind: "module" | "lesson";
  itemId: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-1">
      {isFirst ? null : (
        <ActionForm
          action={moveAction}
          submitLabel="Move up"
          pendingLabel="Moving…"
          variant="tertiary"
          hidden={{ kind, itemId, direction: "up" }}
          srLabel={label}
          className="flex"
        />
      )}
      {isLast ? null : (
        <ActionForm
          action={moveAction}
          submitLabel="Move down"
          pendingLabel="Moving…"
          variant="tertiary"
          hidden={{ kind, itemId, direction: "down" }}
          srLabel={label}
          className="flex"
        />
      )}
    </div>
  );
}

function ModuleEditor({
  courseId,
  versionId,
  courseModule,
  isFirst,
  isLast,
}: {
  courseId: string;
  versionId: string;
  courseModule: ModuleOutline;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <article
      aria-labelledby={`module-${courseModule.id}`}
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 id={`module-${courseModule.id}`} className="text-subheading font-semibold">
          {courseModule.title}
        </h3>
        <MoveButtons
          kind="module"
          itemId={courseModule.id}
          label={`module ${courseModule.title}`}
          isFirst={isFirst}
          isLast={isLast}
        />
      </div>

      {courseModule.lessons.length === 0 ? (
        <p className="text-small text-text-secondary">No lessons yet.</p>
      ) : (
        <ol className="divide-y divide-border rounded-button border border-border">
          {courseModule.lessons.map((lesson, index) => (
            <li
              key={lesson.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                href={`/admin/curriculum/${courseId}/lessons/${lesson.id}`}
                className="font-medium text-accent-light underline-offset-4 hover:underline"
              >
                {lesson.title}
                {lesson.isRequired ? null : (
                  <span className="font-normal text-text-secondary"> (optional)</span>
                )}
              </Link>
              <MoveButtons
                kind="lesson"
                itemId={lesson.id}
                label={`lesson ${lesson.title}`}
                isFirst={index === 0}
                isLast={index === courseModule.lessons.length - 1}
              />
            </li>
          ))}
        </ol>
      )}

      <ActionForm
        action={addLessonAction}
        submitLabel="Add lesson"
        pendingLabel="Adding…"
        variant="secondary"
        hidden={{ versionId, moduleId: courseModule.id }}
        srLabel={`to ${courseModule.title}`}
        className="flex flex-col gap-3"
      >
        <Field id={`new-lesson-${courseModule.id}`} label="New lesson title">
          <input
            id={`new-lesson-${courseModule.id}`}
            name="title"
            required
            maxLength={120}
            className={fieldClasses}
          />
        </Field>
      </ActionForm>

      <details>
        <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
          Edit or remove module<span className="sr-only"> {courseModule.title}</span>
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <ActionForm
            action={updateModuleAction}
            submitLabel="Save module"
            hidden={{ moduleId: courseModule.id }}
          >
            <Field id={`module-title-${courseModule.id}`} label="Module title">
              <input
                id={`module-title-${courseModule.id}`}
                name="title"
                required
                maxLength={120}
                defaultValue={courseModule.title}
                className={fieldClasses}
              />
            </Field>
            <Field id={`module-summary-${courseModule.id}`} label="Summary (optional)">
              <textarea
                id={`module-summary-${courseModule.id}`}
                name="summary"
                rows={2}
                maxLength={1000}
                defaultValue={courseModule.summary}
                className={`${fieldClasses} py-3`}
              />
            </Field>
          </ActionForm>
          <ActionForm
            action={deleteModuleAction}
            submitLabel="Remove module and its lessons"
            pendingLabel="Removing…"
            variant="destructive"
            hidden={{ moduleId: courseModule.id }}
          />
        </div>
      </details>
    </article>
  );
}

function ReadOnlyOutline({ courseId, version }: { courseId: string; version: VersionDetail }) {
  return (
    <section aria-labelledby="outline-heading" className="flex flex-col gap-4">
      <h2 id="outline-heading" className="text-heading font-semibold">
        {version.status === "pending_review" ? "Submitted content" : "Live content"}
      </h2>
      {version.summary ? <p className="max-w-2xl text-text-secondary">{version.summary}</p> : null}
      {version.modules.map((courseModule) => (
        <div
          key={courseModule.id}
          className="flex flex-col gap-2 rounded-card border border-border bg-card p-5"
        >
          <h3 className="text-subheading font-semibold">{courseModule.title}</h3>
          <ol className="flex flex-col gap-1">
            {courseModule.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/admin/curriculum/${courseId}/lessons/${lesson.id}`}
                  className="text-accent-light underline-offset-4 hover:underline"
                >
                  {lesson.title}
                </Link>
                {lesson.isRequired ? null : (
                  <span className="text-text-secondary"> (optional)</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

function PublishPanel({
  versionId,
  requiresReview,
  canPublish,
  canDraft,
}: {
  versionId: string;
  requiresReview: boolean;
  canPublish: boolean;
  canDraft: boolean;
}) {
  const direct = !requiresReview && canPublish;
  if (!direct && !canDraft) {
    return null;
  }
  return (
    <section
      aria-labelledby="publish-heading"
      className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      <h2 id="publish-heading" className="text-subheading font-semibold">
        {direct ? "Publish" : "Submit for review"}
      </h2>
      <p className="text-text-secondary">
        {direct
          ? "Publishing makes this draft the live version. The current version stays in the history, and progress people already made is kept."
          : "A second person with publishing rights will publish it."}
      </p>
      <ActionForm
        action={direct ? publishAction : submitAction}
        submitLabel={direct ? "Publish" : "Submit for review"}
        pendingLabel={direct ? "Publishing…" : "Submitting…"}
        hidden={{ versionId }}
      >
        <Field
          id="change-note"
          label="What changed?"
          hint="Kept with the version, for example “Added a lesson on headroom”."
        >
          <input
            id="change-note"
            name="changeNote"
            required
            maxLength={500}
            aria-describedby="change-note-hint"
            className={fieldClasses}
          />
        </Field>
      </ActionForm>
    </section>
  );
}

function QuizzesPanel({
  courseId,
  version,
  editable,
}: {
  courseId: string;
  version: VersionDetail;
  editable: boolean;
}) {
  const placement = (key: string | null) => {
    const courseModule = version.modules.find((m) => m.key === key);
    return courseModule ? `After “${courseModule.title}”` : "At the end of the course";
  };
  return (
    <section aria-labelledby="quizzes-heading" className="flex flex-col gap-4">
      <h2 id="quizzes-heading" className="text-heading font-semibold">
        Quizzes
      </h2>
      <p className="max-w-2xl text-text-secondary">
        Quizzes are scored automatically against the pass mark you set. Passing one counts towards
        finishing the course; it never approves anyone to serve.
      </p>
      {version.quizzes.length === 0 ? (
        <p className="text-text-secondary">
          {editable ? "No quizzes yet. Add one below." : "This version has no quizzes."}
        </p>
      ) : (
        <ul className="flex max-w-2xl flex-col divide-y divide-border rounded-card border border-border">
          {version.quizzes.map((quiz) => (
            <li key={quiz.id} className="flex flex-col gap-1 p-4">
              <Link
                href={`/admin/curriculum/${courseId}/quizzes/${quiz.id}`}
                className="font-medium text-accent-light underline-offset-4 hover:underline"
              >
                {quiz.title}
                {quiz.isRequired ? null : (
                  <span className="font-normal text-text-secondary"> (optional)</span>
                )}
              </Link>
              <p className="text-small text-text-secondary">
                {placement(quiz.afterModuleKey)} · {rulesLabel(quiz.passPercent, quiz.maxAttempts)}
              </p>
              <p className="text-small text-text-muted">
                {quiz.questionCount === 0
                  ? "No questions yet: add some before publishing"
                  : `${quiz.questionCount} ${quiz.questionCount === 1 ? "question" : "questions"}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <div className="max-w-2xl rounded-card border border-dashed border-border p-5">
          <ActionForm
            action={addQuizAction}
            submitLabel="Add quiz"
            pendingLabel="Adding…"
            variant="secondary"
            hidden={{ versionId: version.id, courseId }}
            className="flex flex-col gap-3"
          >
            <Field id="new-quiz" label="New quiz title">
              <input id="new-quiz" name="title" required maxLength={120} className={fieldClasses} />
            </Field>
            <Field id="new-quiz-placement" label="Where it sits">
              <select
                id="new-quiz-placement"
                name="placement"
                defaultValue="end"
                className={fieldClasses}
              >
                {version.modules.map((courseModule) => (
                  <option key={courseModule.id} value={courseModule.key}>
                    After “{courseModule.title}”
                  </option>
                ))}
                <option value="end">At the end of the course</option>
              </select>
            </Field>
          </ActionForm>
        </div>
      ) : null}
    </section>
  );
}
