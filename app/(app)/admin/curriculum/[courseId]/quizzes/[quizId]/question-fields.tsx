"use client";

import { useState } from "react";
import { Field, fieldClasses } from "@/components/ui/action-form";
import {
  MAX_OPTIONS,
  QUESTION_KINDS,
  QUESTION_KIND_LABELS,
  type QuestionKind,
  type QuizOption,
} from "@/lib/domain/quiz";

/**
 * The question editor's fields (SRS-QUIZ-001). The type decides what's asked: true/false is a
 * statement and its answer; the others are answers to choose from, with the correct ones marked.
 * Only the fields for the chosen type are submitted.
 */
export function QuestionFields({
  kind: initialKind,
  prompt,
  scenario,
  explanation,
  options,
}: {
  kind: QuestionKind;
  prompt: string;
  scenario: string;
  explanation: string;
  options: QuizOption[];
}) {
  const [kind, setKind] = useState<QuestionKind>(initialKind);
  const multiple = kind === "multiple";
  const rows = Array.from({ length: MAX_OPTIONS }, (_, index) => options[index] ?? null);
  const trueFalseAnswer =
    initialKind === "true_false"
      ? options.find((o) => o.correct)?.label === "False"
        ? "false"
        : "true"
      : null;

  return (
    <>
      <Field id="question-kind" label="Type of question">
        <select
          id="question-kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as QuestionKind)}
          className={`${fieldClasses} w-fit`}
        >
          {QUESTION_KINDS.map((value) => (
            <option key={value} value={value}>
              {QUESTION_KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>

      {kind === "scenario" ? (
        <Field
          id="question-scenario"
          label="The situation"
          hint="Describe what's happening, for example during a service."
        >
          <textarea
            id="question-scenario"
            name="scenario"
            rows={4}
            required
            maxLength={2000}
            defaultValue={scenario}
            aria-describedby="question-scenario-hint"
            className={`${fieldClasses} py-3`}
          />
        </Field>
      ) : null}

      <Field id="question-prompt" label={kind === "true_false" ? "Statement" : "Question"}>
        <textarea
          id="question-prompt"
          name="prompt"
          rows={2}
          required
          maxLength={1000}
          defaultValue={prompt}
          className={`${fieldClasses} py-3`}
        />
      </Field>

      {kind === "true_false" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-small font-medium text-text-secondary">
            Is the statement true or false?
          </legend>
          {(["true", "false"] as const).map((value) => (
            <label key={value} className="flex min-h-control items-center gap-3">
              <input
                type="radio"
                name="trueFalseAnswer"
                value={value}
                required
                defaultChecked={trueFalseAnswer === value}
                className="size-5 accent-accent"
              />
              {value === "true" ? "True" : "False"}
            </label>
          ))}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium text-text-secondary">
            Answers to choose from
          </legend>
          <p className="text-small text-text-muted">
            Between two and six. Leave a row empty to skip it.{" "}
            {multiple ? "Tick every correct answer." : "Choose the one correct answer."}
          </p>
          {rows.map((option, index) => (
            <div key={index} className="flex items-center gap-3">
              <label className="flex min-h-control shrink-0 items-center gap-2 text-small">
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name="correct"
                  value={String(index)}
                  required={!multiple}
                  defaultChecked={option?.correct ?? false}
                  className="size-5 accent-accent"
                />
                Correct<span className="sr-only"> (answer {index + 1})</span>
              </label>
              <label htmlFor={`option-${index}`} className="sr-only">
                Answer {index + 1}
              </label>
              <input
                id={`option-${index}`}
                name="optionLabel"
                maxLength={300}
                defaultValue={option?.label ?? ""}
                placeholder={`Answer ${index + 1}`}
                className={`${fieldClasses} flex-1`}
              />
            </div>
          ))}
        </fieldset>
      )}

      <Field
        id="question-explanation"
        label="Explanation (optional)"
        hint="Why the answer is right. Shown with the correct answers when the quiz allows."
      >
        <textarea
          id="question-explanation"
          name="explanation"
          rows={2}
          maxLength={1000}
          defaultValue={explanation}
          aria-describedby="question-explanation-hint"
          className={`${fieldClasses} py-3`}
        />
      </Field>
    </>
  );
}
