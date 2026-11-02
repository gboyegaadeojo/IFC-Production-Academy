import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AutoRefresh } from "@/components/checklist/auto-refresh";
import { BrandMark } from "@/components/brand";
import {
  CurrentItemName,
  CurrentItemTile,
  RunOfServiceTile,
  ServiceClock,
  ServiceTimerTile,
} from "@/components/service-dashboard/service-clock";
import { StreamPreviewTile, ViewersTile } from "@/components/service-dashboard/stream-tiles";
import { TeamTile } from "@/components/service-dashboard/team-tile";
import { TileWall } from "@/components/service-dashboard/tile-wall";
import { createScreenClient, getScreenDashboard, SCREEN_TOKEN_COOKIE } from "@/lib/data/screens";
import { getYoutubeView } from "@/lib/data/stream-viewers";
import { layoutRows, TILES } from "@/lib/domain/service-dashboard";
import { ScreenPairing } from "./pairing";
import { ScreenStage } from "./stage";

export const metadata: Metadata = { title: "Wall screen" };

function serverNow(): number {
  return Date.now();
}

/**
 * The wall TV's own address (ADD-DASH-06): no menus, no sign-in, and no way into the rest of the
 * app. It shows a code until an editor approves it, then the dashboard, read only.
 */
export default async function ScreenPage() {
  const token = (await cookies()).get(SCREEN_TOKEN_COOKIE)?.value;
  const dashboard = token ? await getScreenDashboard(token) : null;
  if (!token || !dashboard) {
    return <ScreenPairing />;
  }

  const { layout, service, items, team, note, checklists, channel } = dashboard;
  const now = serverNow();
  const youtube =
    service && layout.items.some((item) => item.tile === "youtube")
      ? await getYoutubeView(createScreenClient(), service, token, now)
      : ({ status: "off" } as const);

  return (
    <ScreenStage>
      <AutoRefresh />
      <ServiceClock
        items={items}
        startsAt={service?.startsAt ?? new Date(now).toISOString()}
        renderedAt={now}
      >
        <header className="flex min-h-9 shrink-0 items-center gap-4 px-1.5 font-semibold">
          <BrandMark height={24} />
          <h1 className="text-lg">
            {service ? <CurrentItemName /> : "No service on the schedule yet"}
          </h1>
        </header>
        <div
          className="min-h-0 flex-1"
          style={{ "--rows": layoutRows(layout.items) } as React.CSSProperties}
        >
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
                case "preview":
                  return <StreamPreviewTile channelId={channel} />;
                case "youtube":
                  return <ViewersTile view={youtube} platform="YouTube" />;
                case "notes":
                  return (
                    <p className="text-small whitespace-pre-wrap">
                      {note || "No notes for this service yet."}
                    </p>
                  );
                case "checklist":
                  return (
                    <ul className="flex flex-col gap-0.5 text-small">
                      {checklists.length === 0 ? (
                        <li>No checklists for this service yet.</li>
                      ) : null}
                      {checklists.map((checklist) => (
                        <li key={checklist.name} className="flex justify-between gap-2">
                          <span>{checklist.name}</span>
                          <span className="text-text-secondary tabular-nums">
                            {checklist.done} of {checklist.total}
                          </span>
                        </li>
                      ))}
                    </ul>
                  );
                case "sops":
                  return <p className="text-small text-text-secondary">Open SOPs on a computer.</p>;
                default:
                  return (
                    <p className="text-small text-text-secondary">
                      Not connected yet. This will come from {TILES[item.tile].source}.
                    </p>
                  );
              }
            }}
          />
        </div>
      </ServiceClock>
    </ScreenStage>
  );
}
