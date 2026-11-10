import { ActionForm } from "@/components/ui/action-form";
import type { PathwayVersion } from "@/lib/data/onboarding";
import { formatDateTime } from "@/lib/domain/admin";
import { describeSnapshot, restoreChanges } from "@/lib/domain/onboarding";
import { restoreVersionAction } from "./actions";

/**
 * A pathway's version history (G, 2026-11-10). Every change is saved as people edit, one version
 * per sitting. Restoring shows first what it would bring back, take out and change, then saves the
 * result as a new version, so a restore can be undone too.
 */
export function VersionHistory({ versions }: { versions: PathwayVersion[] }) {
  const current = versions[0];
  if (!current) {
    return null;
  }
  return (
    <details className="w-full max-w-md rounded-card border border-border bg-surface p-3 sm:w-auto">
      <summary className="cursor-pointer text-small font-medium">Version history</summary>
      <p className="mt-2 text-small text-text-secondary">
        Every change is saved. Restoring an earlier version puts the pathway back as it was and
        saves that as a new version, so you can undo it. People already in the pathway carry on from
        where they are.
      </p>
      <ol className="mt-3 flex flex-col divide-y divide-border">
        {versions.map((version) => {
          const isCurrent = version.id === current.id;
          const changes = restoreChanges(current.snapshot, version.snapshot);
          return (
            <li key={version.id} className="flex flex-col gap-1 py-2.5 text-small">
              <span className="font-medium">
                Version {version.number}
                {isCurrent ? " (current)" : ""}
              </span>
              <span className="text-text-muted">
                {[
                  formatDateTime(version.savedAt),
                  version.savedBy ?? "When version history started",
                  describeSnapshot(version.snapshot),
                ].join(" · ")}
              </span>
              {version.restoredFrom !== null ? (
                <span className="text-text-muted">
                  Restored from version {version.restoredFrom}
                </span>
              ) : null}
              {isCurrent ? null : (
                <details className="mt-1">
                  <summary className="cursor-pointer font-medium text-accent-light">
                    Restore this version
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 rounded-button bg-card p-3">
                    {changes.same ? (
                      <p>It&apos;s the same as the pathway now, so restoring changes nothing.</p>
                    ) : (
                      <ul className="flex list-disc flex-col gap-1 pl-4">
                        {changes.renamed ? (
                          <li>Renames the pathway to “{version.snapshot.name}”</li>
                        ) : null}
                        {changes.bringsBack.length > 0 ? (
                          <li>Brings back: {changes.bringsBack.join(", ")}</li>
                        ) : null}
                        {changes.takesOut.length > 0 ? (
                          <li>Takes out: {changes.takesOut.join(", ")}</li>
                        ) : null}
                        {changes.changed > 0 ? (
                          <li>
                            Puts back how {changes.changed}{" "}
                            {changes.changed === 1 ? "step was" : "steps were"} set up
                          </li>
                        ) : null}
                      </ul>
                    )}
                    <ActionForm
                      action={restoreVersionAction}
                      submitLabel={`Restore version ${version.number}`}
                      pendingLabel="Restoring…"
                      variant="secondary"
                      hidden={{ versionId: version.id }}
                    />
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
