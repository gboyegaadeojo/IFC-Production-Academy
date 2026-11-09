import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
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
import { canOpenAdminSection, formatDateTime } from "@/lib/domain/admin";
import { groupTeamsByName } from "@/lib/domain/pco-links";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { refreshAction, setSourceAction } from "./actions";
import { PcoLinkRow, PcoPeople, PcoTabs } from "./pco-parts";

export const metadata: Metadata = { title: "Planning Center" };

export default function PlanningCenterPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading Planning Center…" />}>
      <PlanningCenterContent />
    </Suspense>
  );
}

/** The figures worth a glance. A figure above zero in `attention` is something to act on. */
const STATS: { key: string; label: string; attention?: boolean }[] = [
  { key: "plans", label: "Services, next 60 days" },
  { key: "scheduled", label: "People scheduled" },
  { key: "unlinked_positions", label: "In unlinked positions", attention: true },
  { key: "blockouts", label: "Blockout dates" },
  { key: "without_academy_account", label: "Without an Academy account", attention: true },
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

  const links = (
    <div className="flex flex-col gap-3.5">
      {unlinked.length > 0 ? <UnlinkedPlaces places={unlinked} /> : null}
      {mapping.serviceTypes.length === 0 ? (
        <EmptyState title="Nothing from Planning Center yet">
          Service types, teams, and positions appear here after the first read.
        </EmptyState>
      ) : roles.length === 0 ? (
        <p className="text-small text-text-muted">
          Add Academy positions in Competencies and roles first, then link them here.
        </p>
      ) : (
        groupTeamsByName(mapping.serviceTypes).map((team) => (
          <div
            key={team.name}
            className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface"
          >
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_6.5rem] gap-x-3 bg-card px-3.5 py-1.5 text-small font-semibold text-text-muted sm:grid"
            >
              <span>In Planning Center</span>
              <span>Academy position</span>
              <span>Status</span>
            </div>
            <PcoLinkRow
              label={team.name}
              team
              hint={`In ${team.serviceTypes.join(", ")}. Positions without a link follow this.`}
              row={team.wholeTeam}
              roles={roles}
            />
            {team.positions.map((position) => (
              <PcoLinkRow
                key={position.label}
                label={position.label}
                row={position}
                roles={roles}
              />
            ))}
          </div>
        ))
      )}
      {mapping.serviceTypes.length > 0 ? (
        <p className="text-small text-text-muted">
          A team with the same name in several service types shows once here and links everywhere.
          To remove a team, archive or delete it in every service type in Planning Center. Links
          apply from the next read.
        </p>
      ) : null}
    </div>
  );

  const settings = (
    <section
      aria-label="Who schedules"
      className="flex max-w-xl flex-col gap-2 rounded-card border border-border bg-surface p-3.5"
    >
      <h2 className="text-heading font-semibold">
        {source === "planning_center" ? "Planning Center schedules" : "The Academy schedules"}
      </h2>
      <p className="text-text-secondary">
        {source === "planning_center"
          ? "Volunteers accept, decline, and block out dates there, and the Academy shows it."
          : "The Academy schedules with its own tools. Planning Center Services isn't read, so nothing there changes the schedule here."}
      </p>
      <details>
        <summary className="flex min-h-control cursor-pointer items-center text-small font-medium">
          Change this
        </summary>
        <div className="mt-1">
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
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Planning Center"
        description="The schedule comes from Planning Center. Link each position so its people get the right checklist and training."
        actions={
          canRefresh ? (
            <ActionForm
              action={refreshAction}
              submitLabel="Refresh now"
              pendingLabel="Asking…"
              variant="secondary"
            />
          ) : undefined
        }
      />

      {mapping.lastRun ? (
        <div className="flex flex-col gap-1.5">
          <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-border bg-surface sm:grid-cols-5">
            {STATS.map((stat) => {
              const value = Number(mapping.lastRun?.counts[stat.key] ?? 0);
              return (
                <div
                  key={stat.key}
                  className="-mt-px -ml-px flex min-w-0 flex-col-reverse border-t border-l border-border px-3.5 py-2.5 last:max-sm:col-span-2"
                >
                  <dt className="text-small text-text-muted">{stat.label}</dt>
                  <dd
                    className={`tabular text-heading font-semibold ${
                      stat.attention && value > 0 ? "text-warning" : ""
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="text-small text-text-muted">
            Last read {formatDateTime(mapping.lastRun.finishedAt)}. Reads every 15 minutes.
          </p>
        </div>
      ) : (
        <p className="text-text-secondary">
          Not read yet. It starts once the Planning Center token is added to the repository&apos;s
          Actions secrets (PCO_PAT_ID and PCO_PAT_SECRET), within 15 minutes.
        </p>
      )}
      {refreshing ? (
        <p className="text-small text-text-secondary">
          A refresh was asked for at {formatDateTime(lastRequest ?? "")}. It usually takes a minute
          or two; reload to see it.
        </p>
      ) : null}

      <PcoTabs
        tabs={[
          { id: "links", label: "Position links", content: links },
          {
            id: "people",
            label: "Not in the Academy",
            count: mapping.withoutAccount.length,
            content:
              mapping.withoutAccount.length > 0 ? (
                <PcoPeople
                  names={mapping.withoutAccount}
                  inviteHref={
                    canOpenAdminSection(grants, "invitations") ? "/admin/invitations" : null
                  }
                />
              ) : (
                <EmptyState title="Everyone's in">
                  Everyone on a Planning Center team or schedule has an Academy account.
                </EmptyState>
              ),
          },
          { id: "settings", label: "Who schedules", content: settings },
        ]}
      />
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
    <section
      aria-labelledby="unlinked-heading"
      className="flex flex-col gap-2 rounded-card border border-warning-line bg-warning-soft p-3.5"
    >
      <h2
        id="unlinked-heading"
        className="flex flex-wrap items-center gap-2 text-heading font-semibold"
      >
        Scheduled in positions not linked yet
        <StatusBadge tone="pending">{places.length} to link</StatusBadge>
      </h2>
      <p className="text-text-secondary">
        These people won&apos;t see their checklist for the service. Link their Planning Center
        position below; it applies from the next read.
      </p>
      {services.map((service) => (
        <div key={service.eventId} className="flex flex-col gap-1.5">
          <h3 className="font-medium">
            {service.eventTitle}{" "}
            <span className="text-small font-normal text-text-muted">
              {formatDateTime(service.startsAt)}
            </span>
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {places
              .filter((place) => place.eventId === service.eventId)
              .map((place, index) => (
                <li key={`${place.personName}-${index}`} className="flex flex-col px-3.5 py-1.5">
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
