import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getQuizEditor } from "@/lib/data/quizzes";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../../../../../../access-denied";
import { PageSkeleton } from "../../../../../../page-skeleton";
import { saveQuestionAction } from "../../../../../quiz-actions";
import { QuestionFields } from "../../question-fields";

export const metadata: Metadata = { title: "Question" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/curriculum/[courseId]/quizzes/[quizId]/questions/[questionId]">;

export default function QuestionPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the question…" />}>
      <QuestionContent params={params} />
    </Suspense>
  );
}

/** Add or edit one question in a draft quiz (SRS-QUIZ-001). "new" adds one. */
async function QuestionContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("curriculum");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { courseId, quizId, questionId } = await params;
  const isNew = questionId === "new";
  if (!UUID.test(courseId) || !UUID.test(quizId) || (!isNew && !UUID.test(questionId))) {
    notFound();
  }
  const quiz = await getQuizEditor(quizId);
  if (!quiz || quiz.courseId !== courseId) {
    notFound();
  }
  const question = isNew ? null : quiz.questions.find((q) => q.id === questionId);
  if (!isNew && !question) {
    notFound();
  }
  const quizHref = `/admin/curriculum/${courseId}/quizzes/${quiz.id}`;
  if (!quiz.editable || !hasCapability(grants, "course.draft", quiz.departmentId)) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-text-secondary">
          Questions can only be changed in a draft. Choose Edit course on the course page first.
        </p>
        <Link href={quizHref} className={buttonClasses("secondary", "w-fit")}>
          Back to the quiz
        </Link>
      </div>
    );
  }
  const number = question ? quiz.questions.indexOf(question) + 1 : quiz.questions.length + 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Curriculum", href: "/admin/curriculum" },
            { label: quiz.settings.title, href: quizHref },
            { label: isNew ? "New question" : `Question ${number}` },
          ]}
        />
        <h1 className="text-title font-semibold">
          {isNew ? "Add a question" : `Question ${number}`}
        </h1>
      </header>
      <section className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5">
        <ActionForm
          action={saveQuestionAction}
          submitLabel={isNew ? "Add question" : "Save question"}
          hidden={{
            quizId: quiz.id,
            versionId: quiz.courseVersionId,
            courseId,
            questionId: question?.id ?? "",
          }}
        >
          <QuestionFields
            kind={question?.kind ?? "single"}
            prompt={question?.prompt ?? ""}
            scenario={question?.scenario ?? ""}
            explanation={question?.explanation ?? ""}
            options={question?.options ?? []}
          />
        </ActionForm>
      </section>
      <Link
        href={quizHref}
        className="w-fit text-small text-accent-light underline-offset-4 hover:underline"
      >
        Back to the quiz without saving
      </Link>
    </div>
  );
}
