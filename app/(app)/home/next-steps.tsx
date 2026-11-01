import { ActionForm } from "@/components/ui/action-form";
import type { VolunteerPathway } from "@/lib/domain/onboarding";
import { initials } from "@/lib/domain/people";
import { chooseDepartmentAction } from "./actions";

/**
 * "Your next steps" (approved mock, 2026-11-01): where someone is in onboarding, one clear "now"
 * naming their contact, and what comes after. Short on purpose, and smaller than the training.
 */
export function NextSteps({
  pathway,
  departments,
}: {
  pathway: VolunteerPathway;
  departments: { id: string; name: string }[];
}) {
  const total = pathway.steps.length;
  const now = pathway.steps.find((s) => s.state === "now");
  const first = pathway.contactName?.split(" ")[0] ?? null;
  return (
    <section aria-labelledby={`next-${pathway.entryId}`} className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-small text-text-secondary">
          <h2 id={`next-${pathway.entryId}`} className="font-semibold text-text">
            Your next steps
          </h2>
          <span>
            {pathway.name}
            {pathway.nowNumber ? ` · step ${pathway.nowNumber} of ${total}` : ""}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${pathway.name} progress`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={pathway.steps.filter((s) => s.state === "done").length}
          className="flex gap-1"
        >
          {pathway.steps.map((step, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-pill ${step.state === "done" ? "bg-success" : step.state === "now" ? "bg-accent" : "bg-hover"}`}
            />
          ))}
        </div>
      </div>

      {now ? (
        <div className="flex flex-col gap-2.5 rounded-card border border-accent bg-surface p-4 shadow-[0_0_0_1px_var(--accent)]">
          <span className="w-fit rounded-pill bg-accent-soft px-2 text-small text-accent-light">
            Happening now
          </span>
          <p className="font-semibold">
            {now.title}
            {pathway.contactName && now.title.startsWith("A short chat") ? ` with ${first}` : ""}
          </p>
          {pathway.contactName ? (
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-pill bg-accent-soft text-small font-semibold text-accent-light"
              >
                {initials(pathway.contactName)}
              </span>
              <span className="flex flex-col text-small">
                <span className="font-medium">{pathway.contactName}</span>
                <span className="text-text-muted">Your contact</span>
              </span>
            </div>
          ) : null}
          {pathway.choosing ? (
            <ActionForm
              action={chooseDepartmentAction}
              submitLabel="Choose"
              hidden={{ entryId: pathway.entryId }}
              className="flex flex-col gap-3"
            >
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-1.5 text-small text-text-secondary">
                  Where would you like to serve?
                </legend>
                {departments.map((d, i) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center gap-2 rounded-button border border-border px-3 py-1.5 text-small has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                  >
                    <input
                      type="radio"
                      name="departmentId"
                      value={d.id}
                      defaultChecked={i === 0}
                      className="accent-[var(--accent)]"
                    />
                    {d.name}
                  </label>
                ))}
              </fieldset>
            </ActionForm>
          ) : (
            <p className="text-small text-text-secondary">
              {pathway.contactName
                ? `${first} will be in touch. You don't need to do anything yet.`
                : "A leader will be in touch soon. You don't need to do anything yet."}
            </p>
          )}
        </div>
      ) : pathway.finished ? (
        <p className="rounded-card border border-success-line bg-success-soft p-4 text-small">
          You&apos;ve finished {pathway.name}. Welcome to the team.
        </p>
      ) : null}

      <ol className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface text-small">
        {pathway.steps.map((step, i) =>
          step.state === "now" ? null : (
            <li
              key={i}
              className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2 ${step.state === "later" ? "opacity-65" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`flex size-5 items-center justify-center rounded-pill border text-[0.625rem] ${step.state === "done" ? "border-success bg-success text-on-accent" : "border-border-strong"}`}
              >
                {step.state === "done" ? "✓" : i + 1}
              </span>
              <span>{step.title}</span>
              <span className="text-text-muted">
                {step.state === "done" ? "Done" : step.state === "next" ? "Next" : ""}
              </span>
            </li>
          ),
        )}
      </ol>
      <p className="text-small text-text-muted">
        Finishing courses never decides on its own whether you serve. A team leader adds you to a
        team when you&apos;re ready.
      </p>
    </section>
  );
}
