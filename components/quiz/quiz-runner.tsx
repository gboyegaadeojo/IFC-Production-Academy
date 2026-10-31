"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { FormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  chooseOption,
  unansweredQuestions,
  type Answers,
  type LearnerOption,
  type QuestionKind,
} from "@/lib/domain/quiz";

export type RunnerQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  scenario: string;
  options: LearnerOption[];
};

/**
 * Taking a quiz (DESIGN §6.6, SPEC §7 "Quiz"): one question at a time with progress, large answer
 * targets, an answer needed before moving on, then a check of every answer before submitting.
 * The browser never knows which answers are right; the server scores the attempt.
 */
export function QuizRunner({
  questions,
  submit,
}: {
  questions: RunnerQuestion[];
  submit: (answers: Answers) => Promise<FormState>;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const messageId = useId();

  // Move focus to the new question's heading, but not on first load.
  useEffect(() => {
    if (moved.current) {
      headingRef.current?.focus();
    }
  }, [index, reviewing]);

  const question = questions[index];
  const total = questions.length;
  const ids = questions.map((q) => q.id);
  const unanswered = unansweredQuestions(ids, answers);

  function go(next: number) {
    moved.current = true;
    setMessage(null);
    setReviewing(false);
    setIndex(next);
  }

  function nextQuestion() {
    if (!question) {
      return;
    }
    if ((answers[question.id]?.length ?? 0) === 0) {
      setMessage(
        question.kind === "multiple" ? "Choose at least one answer." : "Choose an answer.",
      );
      return;
    }
    if (index + 1 < total) {
      go(index + 1);
    } else {
      moved.current = true;
      setMessage(null);
      setReviewing(true);
    }
  }

  function send() {
    setMessage(null);
    startTransition(async () => {
      const result = await submit(answers);
      if (result.status === "error") {
        setMessage(result.message);
      }
    });
  }

  if (reviewing || !question) {
    return (
      <section aria-labelledby="quiz-review-heading" className="flex flex-col gap-5">
        <h2
          id="quiz-review-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-heading font-semibold outline-none"
        >
          Check your answers
        </h2>
        <p className="text-text-secondary">
          {unanswered.length === 0
            ? `You've answered all ${total} questions. Once you submit, your answers can't be changed.`
            : `${unanswered.length} of ${total} questions have no answer and will count as wrong. Once you submit, your answers can't be changed.`}
        </p>
        <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
          {questions.map((q, position) => {
            const chosen = q.options.filter((o) => answers[q.id]?.includes(o.key));
            return (
              <li
                key={q.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-small text-text-muted">Question {position + 1}</p>
                  <p className="font-medium">{q.prompt}</p>
                  <p className="text-small text-text-secondary">
                    {chosen.length > 0
                      ? `Your answer: ${chosen.map((o) => o.label).join(", ")}`
                      : "No answer yet"}
                  </p>
                </div>
                <Button type="button" variant="tertiary" onClick={() => go(position)}>
                  Change<span className="sr-only"> answer to question {position + 1}</span>
                </Button>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            onClick={send}
            disabled={pending}
            aria-describedby={message ? messageId : undefined}
          >
            {pending ? "Submitting…" : "Submit answers"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => go(total - 1)}
            disabled={pending}
          >
            Back to the questions
          </Button>
          {message ? (
            <p id={messageId} role="alert" className="text-small text-error">
              {message}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  const chosen = answers[question.id] ?? [];
  const multiple = question.kind === "multiple";
  const legendId = `question-${question.id}`;

  return (
    <section aria-labelledby="quiz-question-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2
          id="quiz-question-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-small font-medium text-text-secondary outline-none"
        >
          Question {index + 1} of {total}
        </h2>
        <ProgressBar
          percent={Math.round(((total - unanswered.length) / total) * 100)}
          label="Questions answered"
        />
      </div>

      {question.kind === "scenario" && question.scenario ? (
        <div className="reading-width rounded-card border border-border bg-card p-5">
          <p className="mb-2 eyebrow">The situation</p>
          <p className="whitespace-pre-line text-text">{question.scenario}</p>
        </div>
      ) : null}

      <fieldset
        aria-describedby={message ? messageId : undefined}
        className="flex reading-width flex-col gap-3"
      >
        <legend id={legendId} className="mb-1 text-lead font-semibold text-balance">
          {question.prompt}
        </legend>
        {multiple ? <p className="text-small text-text-muted">Choose all that apply.</p> : null}
        {question.options.map((option) => {
          const checked = chosen.includes(option.key);
          const inputId = `${question.id}-${option.key}`;
          return (
            <label
              key={option.key}
              htmlFor={inputId}
              className={`flex min-h-touch cursor-pointer items-center gap-3 rounded-button border px-4 py-3 transition-surface ${
                checked ? "border-accent bg-hover" : "border-border-strong hover:bg-card"
              }`}
            >
              <input
                id={inputId}
                type={multiple ? "checkbox" : "radio"}
                name={`answer-${question.id}`}
                value={option.key}
                checked={checked}
                onChange={() => {
                  setMessage(null);
                  setAnswers((current) =>
                    chooseOption(current, question.id, question.kind, option.key),
                  );
                }}
                className="size-5 shrink-0 accent-accent"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" onClick={nextQuestion}>
          {index + 1 < total ? "Next question" : "Check your answers"}
        </Button>
        {index > 0 ? (
          <Button type="button" variant="secondary" onClick={() => go(index - 1)}>
            Previous question
          </Button>
        ) : null}
        {message ? (
          <p id={messageId} role="alert" className="text-small text-error">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
