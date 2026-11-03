"use client";

import { useState } from "react";
import { clockLabel } from "@/lib/domain/service-dashboard";
import { type StreamView, type ViewerSample, youtubeEmbedUrl } from "@/lib/domain/stream-viewers";

/**
 * The channel's live stream, muted. It needs no weekly link: YouTube plays whatever the channel is
 * streaming. It runs a little behind the room, so it isn't for judging timing.
 */
export function StreamPreviewTile({ channelId }: { channelId: string | null }) {
  if (!channelId) {
    return (
      <p className="text-small text-text-secondary">
        Not connected yet. Add the YouTube channel in Service Dashboard setup, under Connections.
      </p>
    );
  }
  return (
    <iframe
      title="The YouTube livestream"
      src={youtubeEmbedUrl(channelId)}
      allow="autoplay; encrypted-media"
      className="min-h-0 w-full flex-1 rounded-button border-0 bg-bg"
    />
  );
}

export function ViewersTile({ view, platform }: { view: StreamView; platform: string }) {
  switch (view.status) {
    case "off":
      return (
        <p className="text-small text-text-secondary">
          Not connected yet. See Service Dashboard setup, under Connections.
        </p>
      );
    case "waiting":
      return (
        <p className="text-small text-text-secondary">
          <strong className="block font-medium text-text">Waiting for the stream</strong>
          Looks for it automatically once the service window opens.
        </p>
      );
    case "live":
    case "ended":
      return (
        <>
          <p className="text-title leading-none font-bold tabular-nums">{view.viewers}</p>
          {view.status === "ended" ? (
            <p className="text-small text-text-muted">Last count. The stream has ended.</p>
          ) : null}
          <Sparkline samples={view.samples} label={`${platform} viewers over time`} />
        </>
      );
  }
}

const VIEW_BOX = 100;

/** The trend, with the reading at any point on hover. One series, so the tile's title names it. */
function Sparkline({ samples, label }: { samples: ViewerSample[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (samples.length < 2) {
    return null;
  }
  const values = samples.map((sample) => sample.viewers);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * VIEW_BOX,
    92 - ((value - low) / span) * 80,
  ]);
  const line = points.map(([x, y]) => `${x?.toFixed(2)},${y?.toFixed(2)}`).join(" ");
  const last = points.at(-1) ?? [0, 0];
  const hovered = hover === null ? null : samples[hover];
  const hoverX = hover === null ? 0 : (hover / (values.length - 1)) * 100;

  return (
    <div
      role="img"
      aria-label={`${label}: now ${values.at(-1)}, lowest ${low}, highest ${Math.max(...values)}`}
      className="relative min-h-5 flex-1 touch-none"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const index = Math.round(((event.clientX - box.left) / box.width) * (values.length - 1));
        setHover(Math.max(0, Math.min(values.length - 1, index)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 size-full overflow-visible"
      >
        <polygon
          points={`0,${VIEW_BOX} ${line} ${VIEW_BOX},${VIEW_BOX}`}
          className="fill-info opacity-15"
        />
        <polyline
          points={line}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={2}
          className="stroke-info"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-info ring-2 ring-surface"
        style={{ left: `${last[0]}%`, top: `${last[1]}%` }}
      />
      {hovered ? (
        <>
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-px bg-border-strong"
            style={{ left: `${hoverX}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute -top-1 z-10 rounded-button border border-border-strong bg-card px-1.5 text-small whitespace-nowrap tabular-nums"
            style={hoverX > 55 ? { right: `${100 - hoverX}%` } : { left: `${hoverX}%` }}
          >
            {hovered.viewers} at {clockLabel(Date.parse(hovered.at))}
          </span>
        </>
      ) : null}
    </div>
  );
}
