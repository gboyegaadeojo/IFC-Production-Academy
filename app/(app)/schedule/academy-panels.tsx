import { ActionForm, Field } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { PanelButton } from "@/components/ui/panel-sheet";
import type { ServiceFile } from "@/lib/data/service-files";
import type { CoverRequest, OpenSpot, Unavailable } from "@/lib/data/schedule";
import {
  HOUSEHOLD_MODE_LABELS,
  HOUSEHOLD_MODES,
  type SchedulingPreferences,
} from "@/lib/domain/auto-schedule";
import { blockoutLabel, blockoutTile } from "@/lib/domain/blockouts";
import { eventTimeLabel } from "@/lib/domain/schedule";
import { fileSizeLabel } from "@/lib/domain/service-files";
import {
  removeUnavailabilityAction,
  resetCalendarFeedAction,
  savePreferencesAction,
  signUpAction,
  stopCalendarFeedAction,
  takeCoverAction,
} from "./actions";
import { BlockoutForm } from "./blockout-form";

// What the Schedule page adds while the Academy schedules (G, 2026-11-10): on a computer, cards in
// the side panel (option A); on a phone, tabs that open these as sheets (option D). Planning
// Center's version of the page doesn't use any of this.

const CARD = "flex flex-col gap-2 rounded-card border border-border bg-surface p-4";
const ROW = "flex items-center justify-between gap-3 py-3";
const TAG = "inline-flex h-5 items-center rounded-pill px-2 text-[0.6875rem] font-bold";
export const PANEL_LINK =
  "w-fit text-left text-small font-medium text-accent-light underline-offset-4 hover:underline";

/** One cover request: the role and service, who can't make it and why, and the button. */
function CoverRow({ request, tagged }: { request: CoverRequest; tagged: boolean }) {
  return (
    <li className={ROW}>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">
          {request.roleName} · {request.event.title}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-small text-text-secondary">
          {tagged ? <span className={`${TAG} bg-warning-soft text-warning`}>Cover</span> : null}
          {eventTimeLabel(request.event.startsAt, request.event.endsAt)}
        </span>
        <span className="text-small text-text-muted">
          {request.note
            ? `${request.requestedBy} can't make it: “${request.note}”`
            : `${request.requestedBy} can't make it.`}
        </span>
      </span>
      <ActionForm
        action={takeCoverAction}
        submitLabel="I'll cover it"
        pendingLabel="Saving…"
        hidden={{ requestId: request.id }}
        srLabel={`${request.roleName}, ${request.event.title}`}
        className="flex shrink-0"
      />
    </li>
  );
}

/** One open spot: the role and service, when, and Sign up. */
function SpotRow({ spot, tagged }: { spot: OpenSpot; tagged: boolean }) {
  return (
    <li className={ROW}>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">
          {spot.roleName} · {spot.event.title}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-small text-text-secondary">
          {tagged ? (
            <span className={`${TAG} bg-accent-soft text-accent-light`}>Open spot</span>
          ) : null}
          {eventTimeLabel(spot.event.startsAt, spot.event.endsAt)}
          {spot.event.location ? ` · ${spot.event.location}` : ""}
        </span>
      </span>
      <ActionForm
        action={signUpAction}
        submitLabel="Sign up"
        pendingLabel="Signing up…"
        hidden={{ positionId: spot.positionId }}
        srLabel={`${spot.roleName}, ${spot.event.title}`}
        className="flex shrink-0"
      />
    </li>
  );
}

/** Computer side panel: "Can you cover?" (option A). */
export function CoverCard({ requests }: { requests: CoverRequest[] }) {
  if (requests.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="cover-heading" className={CARD}>
      <h2 id="cover-heading" className="font-semibold">
        Can you cover?
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {requests.map((request) => (
          <CoverRow key={request.id} request={request} tagged={false} />
        ))}
      </ul>
    </section>
  );
}

/** Computer side panel: "Open spots" (option A). */
export function SpotsCard({ spots }: { spots: OpenSpot[] }) {
  if (spots.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="spots-heading" className={CARD}>
      <h2 id="spots-heading" className="font-semibold">
        Open spots
      </h2>
      <p className="text-small text-text-secondary">
        Positions on your teams that still need someone, on days you&apos;re free.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {spots.map((spot) => (
          <SpotRow key={spot.positionId} spot={spot} tagged={false} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The phone's Open spots sheet (option D): one list, cover requests first, each row tagged Cover or
 * Open spot so they can't be mixed up (G's pick, 2026-11-10).
 */
export function SpotsSheet({ requests, spots }: { requests: CoverRequest[]; spots: OpenSpot[] }) {
  if (requests.length + spots.length === 0) {
    return (
      <p className="py-4 text-small text-text-secondary">
        Nothing needs covering, and there are no open spots on days you&apos;re free.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-small text-text-secondary">
        Cover a teammate who can&apos;t make it, or sign up for a spot that still needs someone.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {requests.map((request) => (
          <CoverRow key={request.id} request={request} tagged />
        ))}
        {spots.map((spot) => (
          <SpotRow key={spot.positionId} spot={spot} tagged />
        ))}
      </ul>
    </div>
  );
}

/** The side panel's Blocked dates card while the Academy schedules. */
export function BlockedCard({ away, today }: { away: Unavailable[]; today: string }) {
  const coming = away.filter((entry) => entry.endsOn >= today).slice(0, 3);
  return (
    <section aria-labelledby="blocked-heading" className={CARD}>
      <h2 id="blocked-heading" className="font-semibold">
        Blocked dates
      </h2>
      {coming.length === 0 ? (
        <p className="text-small text-text-secondary">None coming up.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-small">
          {coming.map((entry) => (
            <li key={entry.id}>
              <span className="font-medium">{blockoutLabel(entry)}</span>
              {entry.note ? <span className="text-text-secondary"> · {entry.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <PanelButton panel="blockouts" className={PANEL_LINK}>
        {coming.length === 0 ? "Add blocked dates" : "Manage blocked dates"}
      </PanelButton>
    </section>
  );
}

/**
 * Blockouts (option D's sheet, and the computer's panel): add blocked dates, the ones you have,
 * your calendar link, and how you like to serve.
 */
export function BlockoutsPanel({
  away,
  today,
  feedSince,
  preferences,
  householdOptions,
}: {
  away: Unavailable[];
  today: string;
  feedSince: string | null;
  preferences: SchedulingPreferences | null;
  householdOptions: { id: string; name: string }[];
}) {
  const heading = "text-[0.6875rem] font-semibold tracking-[0.04em] text-text-muted uppercase";
  return (
    <div className="flex flex-col gap-5">
      <p className="text-small text-text-secondary">
        Days you can&apos;t serve. The Academy never picks you then, and schedulers can see them.
      </p>
      <details className="group rounded-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-card bg-accent font-semibold text-on-accent group-open:mb-3 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="text-heading leading-none">
            +
          </span>
          Add blocked dates
        </summary>
        <div className="rounded-b-card border border-t-0 border-border bg-card p-4">
          <BlockoutForm today={today} />
        </div>
      </details>

      <section aria-labelledby="sheet-blocked-heading" className="flex flex-col gap-2">
        <h3 id="sheet-blocked-heading" className={heading}>
          Blocked dates
        </h3>
        {away.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-4 text-center text-small text-text-muted">
            No blocked dates. You can be scheduled any day.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {away.map((entry) => {
              const tile = blockoutTile(entry.startsOn);
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-button bg-hover"
                  >
                    <span className="text-[0.625rem] font-bold tracking-[0.04em] text-error">
                      {tile.month}
                    </span>
                    <span className="text-heading leading-tight font-bold">{tile.day}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{blockoutLabel(entry)}</span>
                    {entry.note ? (
                      <span className="text-small text-text-muted">{entry.note}</span>
                    ) : null}
                  </span>
                  <ActionForm
                    action={removeUnavailabilityAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    variant="tertiary"
                    hidden={{ id: entry.id }}
                    srLabel={blockoutLabel(entry)}
                    className="flex shrink-0 [&_button]:text-error"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="sheet-feed-heading" className="flex flex-col gap-2">
        <h3 id="sheet-feed-heading" className={heading}>
          Your calendar
        </h3>
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Calendar link</span>
            <span className="text-small text-text-secondary">
              Your serving shows up in Google, Apple or Outlook Calendar and stays up to date.
              {feedSince ? " You have a link. Making a new one stops the old one." : ""}
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            <ActionForm
              action={resetCalendarFeedAction}
              submitLabel={feedSince ? "Make a new link" : "Make my link"}
              pendingLabel="Making…"
              variant="secondary"
              className="flex flex-col gap-2"
            />
            {feedSince ? (
              <ActionForm
                action={stopCalendarFeedAction}
                submitLabel="Stop my link"
                pendingLabel="Stopping…"
                variant="tertiary"
                className="flex"
              />
            ) : null}
          </div>
        </div>
      </section>

      {preferences ? (
        <section aria-labelledby="sheet-preferences-heading" className="flex flex-col gap-2">
          <h3 id="sheet-preferences-heading" className={heading}>
            How I like to serve
          </h3>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="mb-3 text-small text-text-secondary">
              Auto-schedule follows these. A scheduler can still ask you for more.
            </p>
            <ActionForm
              action={savePreferencesAction}
              submitLabel="Save preferences"
              pendingLabel="Saving…"
              variant="secondary"
              className="flex flex-col gap-3"
            >
              <Field id="pref-max" label="At most, a month">
                <select
                  id="pref-max"
                  name="maxPerMonth"
                  defaultValue={preferences.maxPerMonth ?? ""}
                  className={fieldClasses}
                >
                  <option value="">No limit</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((times) => (
                    <option key={times} value={times}>
                      {times === 1 ? "Once" : times === 2 ? "Twice" : `${times} times`}
                    </option>
                  ))}
                </select>
              </Field>
              {householdOptions.length > 0 ? (
                <>
                  <Field id="pref-household" label="Someone in my household (optional)">
                    <select
                      id="pref-household"
                      name="householdMemberId"
                      defaultValue={preferences.householdMemberId ?? ""}
                      className={fieldClasses}
                    >
                      <option value="">Nobody</option>
                      {householdOptions.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="pref-mode" label="Schedule us">
                    <select
                      id="pref-mode"
                      name="householdMode"
                      defaultValue={preferences.householdMode ?? "together"}
                      className={fieldClasses}
                    >
                      {HOUSEHOLD_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {HOUSEHOLD_MODE_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              ) : (
                <>
                  <input type="hidden" name="householdMemberId" value="" />
                  <input type="hidden" name="householdMode" value="together" />
                </>
              )}
            </ActionForm>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Files on the services you're on, in their own panel. */
export function FilesPanel({
  files,
  titles,
}: {
  files: ServiceFile[];
  titles: ReadonlyMap<string, string>;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {files.map((file) => (
        <li key={file.id} className="flex flex-col gap-0.5 py-3">
          {file.url ? (
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-light underline-offset-4 hover:underline"
            >
              {file.name}
            </a>
          ) : (
            <span className="font-medium">{file.name}</span>
          )}
          <span className="text-small text-text-muted">
            {titles.get(file.eventId) ? `${titles.get(file.eventId)} · ` : ""}
            {fileSizeLabel(file.bytes)}
          </span>
        </li>
      ))}
    </ul>
  );
}
