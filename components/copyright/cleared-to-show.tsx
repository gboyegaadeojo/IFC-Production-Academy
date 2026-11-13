import { CheckIcon } from "@/components/ui/icons";
import type { ClearedItem } from "@/lib/data/copyright";
import { TIME_ZONE } from "@/lib/domain/time-zone";
import { LoadedTick } from "./loaded-tick";

const serviceDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** Items for one service, in order of service: unplaced first, then by their place in the plan. */
function inServiceOrder(items: ClearedItem[]): ClearedItem[] {
  return [...items].sort(
    (a, b) =>
      (a.planItemPosition ?? -1) - (b.planItemPosition ?? -1) ||
      a.description.localeCompare(b.description),
  );
}

/**
 * Cleared to show (ADD-COPY-08; decision 2026-11-12): the approved videos and graphics for the
 * services this person is on duty for, whatever their position, so whoever covers Computer Graphics
 * knows what's cleared. Each sits at its place in the order of service, with a shared Loaded tick.
 */
export function ClearedToShow({ items, today = false }: { items: ClearedItem[]; today?: boolean }) {
  const services = new Map<string, ClearedItem[]>();
  for (const item of items) {
    services.set(item.eventId, [...(services.get(item.eventId) ?? []), item]);
  }
  return (
    <div className="flex flex-col gap-4">
      {[...services.values()].map((serviceItems) => {
        const first = serviceItems[0];
        if (!first) {
          return null;
        }
        const loaded = serviceItems.filter((item) => item.loadedAt).length;
        const headingId = `cleared-${first.eventId}`;
        return (
          <section
            key={first.eventId}
            aria-labelledby={headingId}
            className="overflow-hidden rounded-card border border-border bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-button bg-success-soft text-success"
                >
                  <CheckIcon className="size-5" />
                </span>
                <div>
                  <h2 id={headingId} className="font-semibold">
                    {today ? "Cleared to show today" : `Cleared to show: ${first.eventTitle}`}
                  </h2>
                  <p className="text-small text-text-secondary">
                    {serviceDay.format(new Date(first.startsAt))} · {serviceItems.length}{" "}
                    {serviceItems.length === 1 ? "item" : "items"} · {loaded} loaded · everyone on
                    duty sees this
                  </p>
                </div>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {inServiceOrder(serviceItems).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold">{item.description}</span>
                    <span className="text-small text-text-secondary">
                      {item.kind === "video" ? "Video" : "Graphic"} ·{" "}
                      {item.planItemTitle ? `at ${item.planItemTitle} · ` : ""}from{" "}
                      {item.requesterName}
                    </span>
                    {item.note ? (
                      <span className="text-small text-text-muted">Note: {item.note}</span>
                    ) : null}
                  </div>
                  {item.mediaUrl ? (
                    <a
                      href={item.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-touch items-center text-small font-semibold text-accent-light underline-offset-4 hover:underline"
                    >
                      Open {item.kind}
                    </a>
                  ) : null}
                  {item.hasFile ? (
                    <a
                      href={`/copyright/file?via=member&r=${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-touch items-center text-small font-semibold text-accent-light underline-offset-4 hover:underline"
                    >
                      Download
                    </a>
                  ) : null}
                  <LoadedTick
                    requestId={item.id}
                    loaded={item.loadedAt !== null}
                    label={item.description}
                  />
                </li>
              ))}
            </ul>
            {today ? (
              <p className="border-t border-border bg-warning-soft px-5 py-3 text-small">
                <strong>Only show what&apos;s on this list.</strong> If someone hands you a video or
                graphic that isn&apos;t here, it hasn&apos;t been cleared. Ask the producer first.
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
