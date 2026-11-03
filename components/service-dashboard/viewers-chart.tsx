"use client";

import { useState } from "react";
import { clockLabel } from "@/lib/domain/service-dashboard";
import type { ViewerSeries } from "@/lib/domain/service-dashboard";

const WIDTH = 720;
const HEIGHT = 260;
const LEFT = 44;
const RIGHT = 96;
const TOP = 12;
const BOTTOM = 28;

/** A round top for the axis, so every label names a value the scale really reaches. */
function niceMax(value: number): number {
  if (value <= 10) {
    return 10;
  }
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

const COLOURS: Record<string, string> = {
  YouTube: "var(--chart-1)",
  Facebook: "var(--chart-2)",
};

/** Viewers across the service, one line per platform on one axis, with a table of every value. */
export function ViewersChart({ series }: { series: ViewerSeries[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hoverAt, setHoverAt] = useState<number | null>(null);

  const all = series.flatMap((line) => line.samples);
  const times = all.map((sample) => sample.at);
  const first = Math.min(...times);
  const last = Math.max(...times);
  const span = last - first || 1;
  const top = niceMax(Math.max(...all.map((sample) => sample.viewers)));
  const x = (at: number) => LEFT + ((at - first) / span) * (WIDTH - LEFT - RIGHT);
  const y = (viewers: number) => HEIGHT - BOTTOM - (viewers / top) * (HEIGHT - TOP - BOTTOM);
  const nearest = (line: ViewerSeries, at: number) =>
    line.samples.reduce((best, sample) =>
      Math.abs(sample.at - at) < Math.abs(best.at - at) ? sample : best,
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-small text-text-secondary">
          {series.map((line) => (
            <li key={line.platform} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3 rounded-pill"
                style={{ background: COLOURS[line.platform] }}
              />
              {line.platform}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
          className="min-h-touch rounded-button px-2 text-small text-accent-light underline"
        >
          {view === "chart" ? "Show as a table" : "Show as a chart"}
        </button>
      </div>

      {view === "table" ? (
        <div className="max-h-96 overflow-auto" tabIndex={0}>
          <table className="w-full text-small">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="py-1 font-medium">Platform</th>
                <th className="py-1 font-medium">Time</th>
                <th className="py-1 text-right font-medium">Viewers</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {series.flatMap((line) =>
                line.samples.map((sample) => (
                  <tr key={`${line.platform}-${sample.at}`} className="border-t border-border">
                    <td className="py-1">{line.platform}</td>
                    <td className="py-1">{clockLabel(sample.at)}</td>
                    <td className="py-1 text-right">{sample.viewers}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`Viewers from ${clockLabel(first)} to ${clockLabel(last)}. The table view has every value.`}
            className="block h-auto w-full max-w-[56rem] min-w-[34rem] touch-none"
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const at =
                first +
                (((event.clientX - box.left) * (WIDTH / box.width) - LEFT) /
                  (WIDTH - LEFT - RIGHT)) *
                  span;
              setHoverAt(Math.max(first, Math.min(last, at)));
            }}
            onPointerLeave={() => setHoverAt(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((share) => (
              <g key={share}>
                <line
                  x1={LEFT}
                  x2={WIDTH - RIGHT}
                  y1={y(top * share)}
                  y2={y(top * share)}
                  stroke="var(--border)"
                />
                <text
                  x={LEFT - 6}
                  y={y(top * share) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--text-muted)"
                >
                  {Math.round(top * share)}
                </text>
              </g>
            ))}
            {[first, first + span / 2, last].map((at) => (
              <text
                key={at}
                x={x(at)}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {clockLabel(at)}
              </text>
            ))}
            {series.map((line) => {
              const end = line.samples.at(-1);
              return (
                <g key={line.platform}>
                  <polyline
                    points={line.samples.map((s) => `${x(s.at)},${y(s.viewers)}`).join(" ")}
                    fill="none"
                    stroke={COLOURS[line.platform]}
                    strokeWidth={2}
                  />
                  {end ? (
                    <>
                      <circle
                        cx={x(end.at)}
                        cy={y(end.viewers)}
                        r={4}
                        fill={COLOURS[line.platform]}
                        stroke="var(--surface)"
                        strokeWidth={2}
                      />
                      <text
                        x={x(end.at) + 8}
                        y={y(end.viewers) + 4}
                        fontSize={11}
                        fill="var(--text-secondary)"
                      >
                        {line.platform} {end.viewers}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
            {hoverAt !== null ? (
              <g>
                <line
                  x1={x(hoverAt)}
                  x2={x(hoverAt)}
                  y1={TOP}
                  y2={HEIGHT - BOTTOM}
                  stroke="var(--border-strong)"
                />
                <text
                  x={Math.min(x(hoverAt) + 6, WIDTH - RIGHT - 150)}
                  y={TOP + 10}
                  fontSize={11}
                  fill="var(--text)"
                >
                  {clockLabel(hoverAt)}:{" "}
                  {series
                    .map((line) => `${line.platform} ${nearest(line, hoverAt).viewers}`)
                    .join(", ")}
                </text>
              </g>
            ) : null}
          </svg>
        </div>
      )}
    </div>
  );
}
