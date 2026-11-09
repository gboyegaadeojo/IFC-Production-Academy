"use client";

import { useState } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import {
  BLOCKOUT_KIND_LABELS,
  BLOCKOUT_KINDS,
  REPEAT_RULES,
  repeatLabel,
  type BlockoutKind,
} from "@/lib/domain/blockouts";
import { addBlockoutAction } from "./actions";

/** Add a blockout, as in Planning Center: one day, a date range, part of a day, or repeating. */
export function BlockoutForm({ today }: { today: string }) {
  const [kind, setKind] = useState<BlockoutKind>("day");
  const [startsOn, setStartsOn] = useState(today);

  return (
    <ActionForm
      action={addBlockoutAction}
      submitLabel="Add blockout"
      pendingLabel="Saving…"
      variant="secondary"
      className="flex flex-col gap-3"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-small font-medium text-text-secondary">Kind of blockout</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {BLOCKOUT_KINDS.map((option) => (
            <label key={option} className="flex min-h-control items-center gap-2">
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="size-5"
              />
              {BLOCKOUT_KIND_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          id="blockout-from"
          label={kind === "range" || kind === "repeating" ? "From" : "Date"}
        >
          <input
            id="blockout-from"
            name="startsOn"
            type="date"
            required
            min={today}
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            className={fieldClasses}
          />
        </Field>
        {kind === "range" || kind === "repeating" ? (
          <Field id="blockout-to" label={kind === "repeating" ? "Until" : "To"}>
            <input
              id="blockout-to"
              name="endsOn"
              type="date"
              required
              min={startsOn}
              className={fieldClasses}
            />
          </Field>
        ) : null}
        {kind === "partial" ? (
          <>
            <Field id="blockout-start" label="From">
              <input
                id="blockout-start"
                name="startTime"
                type="time"
                required
                defaultValue="08:00"
                className={fieldClasses}
              />
            </Field>
            <Field id="blockout-end" label="To">
              <input
                id="blockout-end"
                name="endTime"
                type="time"
                required
                defaultValue="12:00"
                className={fieldClasses}
              />
            </Field>
          </>
        ) : null}
        {kind === "repeating" ? (
          <Field id="blockout-repeat" label="Repeats">
            <select id="blockout-repeat" name="repeat" className={fieldClasses}>
              {REPEAT_RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {repeatLabel(rule, startsOn || today)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <Field
        id="blockout-note"
        label="Reason (optional)"
        hint="Schedulers see it. Leave it blank to just say Away."
      >
        <input
          id="blockout-note"
          name="note"
          maxLength={200}
          aria-describedby="blockout-note-hint"
          className={fieldClasses}
        />
      </Field>
    </ActionForm>
  );
}
