import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";
import { AutoRefresh } from "@/components/checklist/auto-refresh";
import { ChecklistTile } from "@/components/service-dashboard/checklist-tile";
import {
  EncoderTile,
  LiveProvider,
  MixerLevelsTile,
  ProPresenterTimersTile,
  SlidesTile,
} from "@/components/service-dashboard/live-tiles";
import { NotesTile } from "@/components/service-dashboard/notes-tile";
import {
  CurrentItemName,
  CurrentItemTile,
  RunOfServiceTile,
  ServiceClock,
  ServiceTimerTile,
} from "@/components/service-dashboard/service-clock";
import { ServicePicker } from "@/components/service-dashboard/service-picker";
import { StreamPreviewTile } from "@/components/service-dashboard/stream-tiles";
import { TeamTile } from "@/components/service-dashboard/team-tile";
import { TileWall } from "@/components/service-dashboard/tile-wall";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getCurrentServiceId, getServiceChecklists } from "@/lib/data/checklists";
import {
  canViewServiceDashboard,
  getDashboardServices,
  getDashboardTeam,
  getLiveTicket,
  getPlanItems,
  getServiceDashboardLayout,
  getServiceNote,
  getStreamChannel,
} from "@/lib/data/service-dashboard";
import { getSopLibrary, type SopSummary } from "@/lib/data/sops";
import { canOpenAdminSection } from "@/lib/domain/admin";
import { formatDate } from "@/lib/domain/dates";
import { eventTimeLabel } from "@/lib/domain/schedule";
import { type TileKey } from "@/lib/domain/service-dashboard";

export const metadata: Metadata = { title: "Service Dashboard" };

const serviceParam = z.uuid();

/** The time on the server, so the first paint of the clock matches. */
function serverNow(): number {
  return Date.now();
}

export default function ServiceDashboardPage({ searchParams }: PageProps<"/service-dashboard">) {
  return (
    <div className="mx-auto flex w-full max-w-[92.5rem] flex-1 flex-col gap-3 px-4 py-4 lg:px-6">
      <Suspense
        fallback={
          <>
            <LoadingStatus label="Loading the Service Dashboard…" />
            <Skeleton className="h-96 w-full" />
          </>
        }
      >
        <ServiceDashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * One screen for the whole service (ADD-DASH-01). Computers only: phones and the installed app get
 * a message instead (ADD-DASH-02). It only ever reads, so it can't affect the live service.
 */
async function ServiceDashboardContent({
  searchParams,
}: Pick<PageProps<"/service-dashboard">, "searchParams">) {
  await requireActiveUser();
  if (!(await canViewServiceDashboard())) {
    return (
      <section className="flex max-w-xl flex-col gap-3 rounded-card border border-border bg-card p-8">
        <h1 className="text-heading font-semibold">The Service Dashboard isn&apos;t open to you</h1>
        <p className="text-text-secondary">
          It&apos;s for people on a production team in Planning Center. If you&apos;re on a team and
          still see this, talk to the Production Director or a Platform Admin.
        </p>
        <Link href="/home" className={buttonClasses("secondary", "self-start")}>
          Back to Training
        </Link>
      </section>
    );
  }

  const requested = serviceParam.safeParse((await searchParams).service);
  const [layout, grants, services, currentId] = await Promise.all([
    getServiceDashboardLayout(),
    getMyCapabilities(),
    getDashboardServices(),
    getCurrentServiceId(),
  ]);
  const canEdit = canOpenAdminSection(grants, "service-dashboard");
  const service =
    services.find((entry) => entry.id === requested.data) ??
    services.find((entry) => entry.id === currentId) ??
    services[0] ??
    null;

  const smallScreen = (
    <section className="only-on-small-screens flex max-w-xl flex-col gap-3 rounded-card border border-border bg-card p-6">
      <h1 className="text-heading font-semibold">Open this on a computer</h1>
      <p className="text-text-secondary">
        The Service Dashboard is made for booth computers and the wall TV. Your training, schedule,
        checklist, and SOPs all work here.
      </p>
      <Link href="/home" className={buttonClasses("primary", "self-start")}>
        Go to Training
      </Link>
    </section>
  );

  const editLink = canEdit ? (
    <Link href="/admin/service-dashboard" className={buttonClasses("secondary")}>
      Edit layout
    </Link>
  ) : null;

  if (!service) {
    return (
      <>
        {smallScreen}
        <div className="only-on-computer flex-col gap-3">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-title font-semibold">Service Dashboard</h1>
            {editLink}
          </header>
          <p className="text-text-secondary">
            No service on the schedule yet. The dashboard opens to the next one as soon as it&apos;s
            in Planning Center.
          </p>
        </div>
      </>
    );
  }

  const shows = (tile: TileKey) => layout.items.some((item) => item.tile === tile);
  const renderedAt = serverNow();
  const [items, team, note, checklists, sops, channel, ticket] = await Promise.all([
    getPlanItems(service.id),
    shows("team") ? getDashboardTeam(service.id) : [],
    shows("notes") ? getServiceNote(service.id) : "",
    shows("checklist") ? getServiceChecklists(service.id) : null,
    shows("sops") ? getSopLibrary() : [],
    shows("preview") ? getStreamChannel() : null,
    getLiveTicket(renderedAt),
  ]);

  return (
    <>
      {smallScreen}
      <div className="only-on-computer flex-col gap-3">
        <AutoRefresh />
        <LiveProvider ticket={ticket}>
          <ServiceClock items={items} startsAt={service.startsAt} renderedAt={renderedAt}>
            <header className="flex flex-wrap items-stretch gap-2">
              <h1 className="sr-only">Service Dashboard</h1>
              <ServicePicker
                current={service.id}
                services={services.map((entry) => ({
                  id: entry.id,
                  label: `${entry.title}, ${formatDate(entry.startsAt)}`,
                }))}
              />
              <div className="flex flex-col justify-center rounded-card border border-border bg-surface px-3 py-1.5">
                <span className="text-small text-text-muted">Service time</span>
                <span className="font-medium">
                  {eventTimeLabel(service.startsAt, service.endsAt)}
                </span>
              </div>
              <div className="flex min-w-48 flex-1 flex-col justify-center rounded-card border border-border bg-surface px-3 py-1.5">
                <span className="text-small text-text-muted">Current item, by the plan</span>
                <strong className="font-medium">
                  <CurrentItemName />
                </strong>
              </div>
              <Link href="/help/service-dashboard" className={buttonClasses("secondary")}>
                Guide
              </Link>
              <Link href="/service-dashboard/review" className={buttonClasses("secondary")}>
                After the service
              </Link>
              {editLink}
            </header>
            <TileWall
              items={layout.items}
              content={(item) => {
                switch (item.tile) {
                  case "run":
                    return <RunOfServiceTile />;
                  case "current":
                    return <CurrentItemTile />;
                  case "timer":
                    return <ServiceTimerTile />;
                  case "team":
                    return <TeamTile team={team} />;
                  case "notes":
                    return <NotesTile eventId={service.id} body={note} />;
                  case "checklist":
                    return checklists ? (
                      <ChecklistTile
                        eventId={service.id}
                        checklists={checklists.checklists}
                        canTick={checklists.state.canTick && checklists.state.open}
                      />
                    ) : (
                      <p className="text-small text-text-secondary">
                        The checklist isn&apos;t open to you for this service.
                      </p>
                    );
                  case "sops":
                    return <SopsTile sops={sops} />;
                  case "slides":
                    return <SlidesTile />;
                  case "pptimers":
                    return <ProPresenterTimersTile />;
                  case "encoder":
                    return <EncoderTile />;
                  case "levels":
                    return (
                      <MixerLevelsTile
                        chosen={layout.channels}
                        editLink={
                          canEdit ? (
                            <Link
                              href="/admin/service-dashboard/channels"
                              className="text-accent-light underline"
                            >
                              Choose channels
                            </Link>
                          ) : null
                        }
                      />
                    );
                  case "spl":
                    return (
                      <p className="text-small text-text-secondary">
                        <strong className="block font-medium text-text">Ready, switched off</strong>
                        This turns on when a measurement mic or SMAART is connected. The mixer
                        can&apos;t measure room loudness.
                      </p>
                    );
                  case "preview":
                    return <StreamPreviewTile channelId={channel} />;
                }
              }}
            />
          </ServiceClock>
        </LiveProvider>
      </div>
    </>
  );
}

function SopsTile({ sops }: { sops: SopSummary[] }) {
  if (sops.length === 0) {
    return <p className="text-small text-text-secondary">No SOPs published yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-small">
      {sops.slice(0, 8).map((sop) => (
        <li key={sop.id}>
          <Link href={`/sops/${sop.id}`} className="text-accent-light underline">
            {sop.current?.title}
          </Link>
        </li>
      ))}
      <li>
        <Link href="/sops" className="text-text-secondary underline">
          All SOPs
        </Link>
      </li>
    </ul>
  );
}
