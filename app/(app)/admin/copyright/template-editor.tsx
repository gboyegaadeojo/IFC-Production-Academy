"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { FormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-classes";
import {
  DEFAULT_TEMPLATES,
  FILL_INS,
  fillTemplate,
  TEMPLATE_INFO,
  TEMPLATE_KEYS,
  type EmailTemplate,
  type FillInValues,
  type TemplateKey,
} from "@/lib/domain/copyright";
import { templateAction } from "./actions";

const idle: FormState = { status: "idle" };

/** Example details for the preview, the same as "Send me a test" uses. */
const EXAMPLE: FillInValues = {
  "first name": "Sam",
  "requester name": "Sam Rivera",
  what: "video",
  title: "Missions moment before the offering",
  "service date": "Sunday 22 Nov",
  reference: "CR-0000",
  deadline: "5 days",
  "reviewer name": "Robin",
  "reviewer note": "Looks great. Please send the final file to the producer by Friday.",
  question: "Is the background song covered by our streaming licence?",
  "asked by": "Morgan",
};

/**
 * The six emails (ADD-COPY-09): a subject and message each, with fill-ins in braces, a live
 * preview with example details, and Save, Put back the original, and Send me a test.
 */
export function TemplateEditor({
  templates,
  saved,
}: {
  templates: Record<TemplateKey, EmailTemplate>;
  saved: TemplateKey[];
}) {
  const [key, setKey] = useState<TemplateKey>("received");
  const [drafts, setDrafts] = useState(templates);
  const [state, action, pending] = useActionState(templateAction, idle);
  const body = useRef<HTMLTextAreaElement>(null);
  const ids = { subject: useId(), body: useId(), result: useId() };
  const draft = drafts[key];
  const edit = (change: Partial<EmailTemplate>) =>
    setDrafts((all) => ({ ...all, [key]: { ...all[key], ...change } }));

  function insert(fillIn: string) {
    const area = body.current;
    const text = `{${fillIn}}`;
    if (!area) {
      edit({ body: `${draft.body}${text}` });
      return;
    }
    const start = area.selectionStart ?? draft.body.length;
    const end = area.selectionEnd ?? start;
    edit({ body: `${draft.body.slice(0, start)}${text}${draft.body.slice(end)}` });
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Which email" className="flex flex-wrap gap-2">
        {TEMPLATE_KEYS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={key === option}
            onClick={() => setKey(option)}
            className={`min-h-touch rounded-pill border px-4 text-small font-semibold ${
              key === option
                ? "border-text bg-text text-bg"
                : "border-border bg-surface text-text-secondary hover:border-border-strong"
            }`}
          >
            {TEMPLATE_INFO[option].name}
            {saved.includes(option) ? <span className="sr-only"> (changed)</span> : null}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form
          action={action}
          className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
        >
          <p className="text-small text-text-secondary">{TEMPLATE_INFO[key].when}</p>
          <input type="hidden" name="key" value={key} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.subject} className="text-small font-medium text-text-secondary">
              Subject
            </label>
            <input
              id={ids.subject}
              name="subject"
              value={draft.subject}
              maxLength={200}
              onChange={(event) => edit({ subject: event.target.value })}
              className={fieldClasses}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.body} className="text-small font-medium text-text-secondary">
              Message
            </label>
            <textarea
              id={ids.body}
              ref={body}
              name="body"
              rows={9}
              maxLength={4000}
              value={draft.body}
              onChange={(event) => edit({ body: event.target.value })}
              className={`${fieldClasses} py-2`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-small font-medium text-text-secondary">
              Fill-ins: press one to add it to the message
            </span>
            <div className="flex flex-wrap gap-1.5">
              {FILL_INS.map((fillIn) => (
                <button
                  key={fillIn}
                  type="button"
                  onClick={() => insert(fillIn)}
                  className="min-h-8 rounded-pill border border-border bg-hover px-3 text-small"
                >
                  {`{${fillIn}}`}
                </button>
              ))}
            </div>
          </div>
          {state.status !== "idle" ? (
            <p
              id={ids.result}
              role={state.status === "error" ? "alert" : "status"}
              className={`text-small ${state.status === "error" ? "text-error" : "text-text-secondary"}`}
            >
              {state.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="save" disabled={pending}>
              Save
            </Button>
            <Button type="submit" name="intent" value="test" variant="secondary" disabled={pending}>
              Send me a test
            </Button>
            <Button
              type="submit"
              name="intent"
              value="reset"
              variant="tertiary"
              disabled={pending}
              onClick={() => setDrafts((all) => ({ ...all, [key]: DEFAULT_TEMPLATES[key] }))}
            >
              Put back the original
            </Button>
          </div>
        </form>
        <section aria-label="Preview" className="flex flex-col gap-3 rounded-card bg-hover p-5">
          <span className="text-small font-semibold text-text-secondary">
            Preview, with an example request
          </span>
          <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
            <p className="font-semibold">{fillTemplate(draft.subject, EXAMPLE)}</p>
            <p className="whitespace-pre-line text-text-secondary">
              {fillTemplate(draft.body, EXAMPLE)}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
