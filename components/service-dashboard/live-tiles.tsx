"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { EMPTY_LIVE_STATE, isBridgeOffline, type LiveState } from "@/lib/domain/live-room";
import { channelsToShow, HOT_PERCENT, MIXER_CHANNELS } from "@/lib/domain/mixer";
import { clockLabel } from "@/lib/domain/service-dashboard";

type Live = { state: LiveState; offline: boolean; enabled: boolean };

const LiveContext = createContext<Live>({
  state: EMPTY_LIVE_STATE,
  offline: true,
  enabled: false,
});

/**
 * A live link to the church gear's readings (ADD-DASH-09). It only ever listens. If the link or the
 * bridge drops, tiles keep their last reading and say so, and everything else on the page carries
 * on. The ticket is fresh from each page refresh, so a reconnect always has a good one.
 */
export function LiveProvider({ ticket, children }: { ticket: string | null; children: ReactNode }) {
  const [state, setState] = useState<LiveState>(EMPTY_LIVE_STATE);
  const [now, setNow] = useState(() => Date.now());
  const latestTicket = useRef(ticket);
  const enabled = ticket !== null;

  useEffect(() => {
    latestTicket.current = ticket;
  }, [ticket]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let stopped = false;
    let backoff = 1000;

    const connect = () => {
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const query = new URLSearchParams({ ticket: latestTicket.current ?? "" });
      socket = new WebSocket(`${scheme}//${window.location.host}/live/connect?${query}`);
      socket.onopen = () => {
        backoff = 1000;
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        const update = JSON.parse(event.data) as Partial<LiveState>;
        setState((previous) => ({ ...previous, ...update }));
      };
      socket.onclose = () => {
        if (!stopped) {
          retry = window.setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30_000);
        }
      };
    };

    connect();
    const clock = window.setInterval(() => setNow(Date.now()), 2000);
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      window.clearInterval(clock);
      socket?.close();
    };
  }, [enabled]);

  return (
    <LiveContext.Provider
      value={{ state, enabled, offline: isBridgeOffline(state.bridgeSeenAt, now) }}
    >
      {children}
    </LiveContext.Provider>
  );
}

function useLive(): Live {
  return useContext(LiveContext);
}

/** The same words on every gear tile when there's nothing to show yet, or the bridge has gone. */
function BridgeNotice() {
  const { enabled, offline, state } = useLive();
  if (!enabled) {
    return (
      <p className="text-small text-text-secondary">
        Not connected yet. This comes through the bridge on a church computer.
      </p>
    );
  }
  if (!offline) {
    return null;
  }
  return (
    <p className="text-[0.6875rem] font-medium text-warning">
      {state.bridgeSeenAt
        ? `Offline, last seen ${clockLabel(state.bridgeSeenAt)}`
        : "Offline. Check that the bridge computer is on."}
    </p>
  );
}

function Stale({ children }: { children: ReactNode }) {
  const { offline } = useLive();
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-1.5 ${offline ? "opacity-60" : ""}`}>
      {children}
    </div>
  );
}

/** The slide on screen and the next three (decided 2026-11-02). Read only. */
export function SlidesTile() {
  const { state } = useLive();
  const slides = state.slides;
  return (
    <>
      <BridgeNotice />
      {slides && slides.slides.length > 0 ? (
        <Stale>
          <ol className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-x-2 gap-y-1">
            {slides.slides.map((slide, offset) => (
              <li key={slide.index} className="flex min-h-0 min-w-0 flex-col gap-0.5">
                <span className="text-[0.6875rem] font-medium text-text-muted">
                  {offset === 0 ? "On screen" : offset === 1 ? "Next" : "Then"}
                </span>
                <div
                  className={`relative flex min-h-12 flex-1 items-center justify-center overflow-hidden rounded-button border bg-card p-1 text-center text-small font-medium ${
                    offset === 0 ? "border-2 border-accent-light" : "border-border"
                  }`}
                >
                  {slide.image ? (
                    // A small picture from ProPresenter, already in the page.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slide.image}
                      alt={slide.text}
                      className="absolute inset-0 size-full object-contain"
                    />
                  ) : (
                    <span className="line-clamp-3">{slide.text || `Slide ${slide.index + 1}`}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[0.6875rem] text-text-muted">
            {slides.presentation}, slide {slides.position + 1} of {slides.total}. Read only.
          </p>
        </Stale>
      ) : null}
    </>
  );
}

export function ProPresenterTimersTile() {
  const { state } = useLive();
  const timers = state.reading?.timers;
  return (
    <>
      <BridgeNotice />
      {timers ? (
        <Stale>
          {timers.length === 0 ? (
            <p className="text-small text-text-secondary">No timers in ProPresenter.</p>
          ) : (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-small">
              {timers.map((timer) => (
                <div key={timer.name} className="contents">
                  <dt className="truncate text-text-muted">{timer.name}</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {timer.time}
                    {timer.state === "running" ? "" : `, ${timer.state}`}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-[0.6875rem] text-text-muted">
            Read only. Start timers in ProPresenter.
          </p>
        </Stale>
      ) : null}
    </>
  );
}

export function EncoderTile() {
  const { state } = useLive();
  const encoder = state.reading?.encoder;
  return (
    <>
      <BridgeNotice />
      {encoder ? (
        <Stale>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-small">
            <dt className="text-text-muted">Input</dt>
            <dd className="text-right tabular-nums">
              <span className={`font-medium ${encoder.inputGood ? "text-success" : "text-error"}`}>
                {encoder.inputGood ? "Good" : "Problem"}
              </span>
              , {encoder.input}
            </dd>
            {encoder.streams.map((stream) => (
              <div key={stream.name} className="contents">
                <dt className="truncate text-text-muted">{stream.name}</dt>
                <dd
                  className={`text-right font-medium ${stream.live ? "text-success" : "text-text-secondary"}`}
                >
                  {stream.live ? "Streaming" : "Not streaming"}
                </dd>
              </div>
            ))}
          </dl>
        </Stale>
      ) : null}
    </>
  );
}

const LABELS = new Map(MIXER_CHANNELS.map((channel) => [channel.id, channel.number]));

/** Signal levels for the channels the editors chose. The mixer can't measure room loudness. */
export function MixerLevelsTile({
  chosen,
  editLink,
}: {
  chosen: readonly string[];
  editLink?: ReactNode;
}) {
  const { state } = useLive();
  const levels = state.reading?.levels;
  const names = state.reading?.names;
  const channels = channelsToShow(chosen);
  return (
    <>
      <BridgeNotice />
      {levels ? (
        <Stale>
          <div
            role="img"
            aria-label={`Signal levels for ${channels.length} channels`}
            className="flex min-h-0 flex-1 gap-1.5 overflow-x-auto"
          >
            {channels.map((id) => {
              const level = levels[id] ?? 0;
              const hot = level > HOT_PERCENT;
              return (
                <div key={id} className="flex min-w-11 flex-1 flex-col items-center gap-0.5">
                  <div className="relative min-h-6 w-3 flex-1 overflow-hidden rounded-sm bg-hover">
                    <div
                      className={`absolute inset-x-0 bottom-0 rounded-sm transition-[height] duration-300 motion-reduce:transition-none ${hot ? "bg-warning" : "bg-success"}`}
                      style={{ height: `${level}%` }}
                    />
                  </div>
                  <span className="line-clamp-2 text-center text-[0.625rem] leading-tight text-text-muted">
                    {names?.[id] ?? LABELS.get(id) ?? id}
                  </span>
                </div>
              );
            })}
          </div>
        </Stale>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-text-muted">
        <span>Signal levels, not room loudness.</span>
        {editLink}
      </div>
    </>
  );
}
