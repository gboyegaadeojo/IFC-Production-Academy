import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import {
  getLastRefreshRequest,
  getPcoMapping,
  getSchedulingSource,
  getUnlinkedPlaces,
  pcoRefreshEnabled,
  type UnlinkedPlace,
} from "@/lib/data/planning-center";
import { getSchedulableRoles } from "@/lib/data/service-types";
import { formatDateTime } from "@/lib/domain/admin";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { refreshAction, setLinkAction, setSourceAction } from "./actions";

export const metadata: Metadata = { title: "Planning Center" };

export default function PlanningCenterPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading Planning Center…" />}>
      <PlanningCenterContent />
    </Suspense>
  );
}

const COUNT_LABELS: [key: string, label: string][] = [
  ["plans", "services in the next 60 days"],
  ["scheduled", "people scheduled"],
  ["people_matched", "people matched to an Academy account"],
  ["without_academy_account", "scheduled without an Academy account"],
  ["unlinked_positions", "scheduled in positions not linked yet"],
  ["team_places", "places on position teams"],
  ["blockouts", "blockout dates"],
];

/**
 * Planning Center (decision record 9, revised): the schedule comes from Planning Center Services.
 * Link each Planning Center position to an Academy position, as on the checklist app's Team
 * mapping page. People are matched by their email.
 */
async function PlanningCenterContent() {
  const { grants, allowed } = await getAdminAccess("planning-center");
  if (!allowed) {
    return <AccessDenied />;
  }
  const canRefresh = pcoRefreshEnabled();
  const [mapping, source, roles, unlinked, lastRequest] = await Promise.all([
    getPcoMapping(),
    getSchedulingSource(),
    getSchedulableRoles(grants),
    getUnlinkedPlaces(),
    canRefresh ? getLastRefreshRequest() : Promise.resolve(null),
  ]);
  // Asked for since the last read finished: the run is still under way.
  const refreshing =
    lastRequest !== null &&
    (!mapping.lastRun || Date.parse(lastRequest) > Date.parse(mapping.lastRun.finishedAt));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Planning Center"
        description="The schedule comes from Planning Center Services, read every 15 minutes. People are matched by the email they sign in with. Link each Planning Center position to an Academy position so its people get the right checklist and training."
      />

      <section
        aria-labelledby="sync-heading"
        className="flex max-w-3xl flex-col gap-3 rounded-card border border-border p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="sync-heading" className="text-heading font-semibold">
            Last read
          </h2>
          {canRefresh ? (
            <ActionForm
              action={refreshAction}
              submitLabel="Refresh from Planning Center"
              pendingLabel="Asking…"
              variant="secondary"
            />
          ) : null}
        </div>
        {refreshing ? (
          <p className="text-small text-text-secondary">
            A refresh was asked for at {formatDateTime(lastRequest ?? "")}. It usually takes a
            minute or two; reload to see it.
          </p>
        ) : null}
        {mapping.lastRun ? (
          <>
            <p className="text-text-secondary">{formatDateTime(mapping.lastRun.finishedAt)}</p>
            <ul className="grid gap-x-6 gap-y-1 text-small sm:grid-cols-2">
              {COUNT_LABELS.map(([key, label]) => (
                <li key={key} className="flex gap-2">
                  <span className="tabular font-mono text-text">
                    {Number(mapping.lastRun?.counts[key] ?? 0)}
                  </span>
                  <span className="text-text-secondary">{label}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-text-secondary">
            Not read yet. It starts once the Planning Center token is added to the repository&apos;s
            Actions secrets (PCO_PAT_ID and PCO_PAT_SECRET), within 15 minutes.
          </p>
        )}
      </section>

      <section aria-labelledby="links-heading" className="flex max-w-4xl flex-col gap-4">
        <h2 id="links-heading" className="text-heading font-semibold">
          Position links
        </h2>
        {mapping.serviceTypes.length === 0 ? (
          <EmptyState title="Nothing from Planning Center yet">
            Service types, teams, and positions appear here after the first read.
          </EmptyState>
        ) : roles.length === 0 ? (
          <p className="text-small text-text-muted">
            Add Academy positions in Competencies and roles first, then link them here.
          </p>
        ) : (
          mapping.serviceTypes.map((type) => (
            <div key={type.id} className="flex flex-col gap-3">
              <h3 className="font-semibold">{type.name}</h3>
              {type.teams.length === 0 ? (
                <p className="text-small text-text-muted">No teams.</p>
              ) : (
                type.teams.map((team) => (
                  <div
                    key={team.id}
                    className="flex flex-col divide-y divide-border rounded-card border border-border"
                  >
                    <LinkRow
                      label={team.name}
                      hint="Whole team: positions without their own link follow this."
                      teamId={team.id}
                      positionId=""
                      roleId={team.roleId}
                      roles={roles}
                    />
                    {team.positions.map((position) => (
                      <LinkRow
                        key={position.id}
                        label={position.name}
                        teamId={team.id}
                        positionId={position.id}
                        roleId={position.roleId}
                        roles={roles}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          ))
        )}
      </section>

      {unlinked.length > 0 ? <UnlinkedPlaces places={unlinked} /> : null}

      {mapping.withoutAccount.length > 0 ? (
        <section aria-labelledby="accounts-heading" className="flex max-w-3xl flex-col gap-3">
          <h2 id="accounts-heading" className="text-heading font-semibold">
            Not in the Academy yet
          </h2>
          <p className="text-small text-text-secondary">
            On a Planning Center team or schedule, but no Academy account uses one of their Planning
            Center emails. Invite them with the email they use in Planning Center.
          </p>
          <ul className="flex flex-wrap gap-2">
            {mapping.withoutAccount.map((name, index) => (
              <li key={`${name}-${index}`}>
                <StatusBadge tone="neutral">{name}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="source-heading"
        className="flex max-w-3xl flex-col gap-3 rounded-card border border-border p-5"
      >
        <h2 id="source-heading" className="text-subheading font-semibold">
          Who schedules
        </h2>
        <p className="text-small text-text-secondary">
          {source === "planning_center"
            ? "Planning Center schedules. Volunteers accept, decline, and block out dates there; the Academy shows it."
            : "The Academy schedules with its own tools. Planning Center isn't read."}
        </p>
        <details>
          <summary className="flex min-h-control cursor-pointer items-center text-small font-medium">
            Change this
          </summary>
          <div className="mt-2">
            <ActionForm
              action={setSourceAction}
              submitLabel={
                source === "planning_center"
                  ? "Schedule in the Academy instead"
                  : "Schedule in Planning Center"
              }
              pendingLabel="Saving…"
              variant="secondary"
              hidden={{ source: source === "planning_center" ? "academy" : "planning_center" }}
            />
          </div>
        </details>
      </section>
    </div>
  );
}

/**
 * Scheduled in a position that isn't linked, or whose name matches nothing in Planning Center
 * (checklist app US-15, C39): they won't see their checklist until it's linked.
 */
function UnlinkedPlaces({ places }: { places: UnlinkedPlace[] }) {
  const services = [...new Map(places.map((p) => [p.eventId, p])).values()];
  return (
    <section aria-labelledby="unlinked-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="unlinked-heading" className="flex items-center gap-2 text-heading font-semibold">
        Scheduled in positions not linked yet
        <StatusBadge tone="pending">{places.length} to link</StatusBadge>
      </h2>
      <p className="text-small text-text-secondary">
        These people won&apos;t see their checklist for the service. Link their Planning Center
        position below; it applies from the next read.
      </p>
      {services.map((service) => (
        <div key={service.eventId} className="flex flex-col gap-2">
          <h3 className="font-medium">
            {service.eventTitle}{" "}
            <span className="text-small font-normal text-text-muted">
              {formatDateTime(service.startsAt)}
            </span>
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
            {places
              .filter((place) => place.eventId === service.eventId)
              .map((place, index) => (
                <li key={`${place.personName}-${index}`} className="flex flex-col px-4 py-2">
                  <span className="text-text">{place.personName}</span>
                  <span className="text-small text-text-muted">
                    {[place.teamName, place.positionName || "No position"]
                      .filter(Boolean)
                      .join(" › ")}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function LinkRow({
  label,
  hint,
  teamId,
  positionId,
  roleId,
  roles,
}: {
  label: string;
  hint?: string;
  teamId: string;
  positionId: string;
  roleId: string | null;
  roles: { id: string; name: string; departmentName: string }[];
}) {
  const id = `link-${teamId}-${positionId || "team"}`;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-small text-text-muted">
          {hint ?? (roleId ? "Linked" : "Not linked")}
        </span>
      </div>
      <ActionForm
        action={setLinkAction}
        submitLabel="Save"
        pendingLabel="Saving…"
        variant="secondary"
        hidden={{ teamId, positionId }}
        srLabel={label}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor={id} className="sr-only">
          Academy position for {label}
        </label>
        <select id={id} name="roleId" defaultValue={roleId ?? ""} className={fieldClasses}>
          <option value="">Not linked</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name} ({role.departmentName})
            </option>
          ))}
        </select>
      </ActionForm>
    </div>
  );
}
