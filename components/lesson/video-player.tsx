"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { InfoIcon } from "@/components/ui/icons";
import { resumeFrom, youtubeWatchUrl, type VideoRef } from "@/lib/domain/video";

/**
 * Lesson video (DESIGN §6.5, SRS-LESSON-002, -004, -006). Shows the lesson's video and reports
 * where it was paused so the learner can resume on another device (SRS-PROG-003). That position is
 * an informal signal: nothing here marks a lesson complete or claims it was watched.
 */
export function VideoPlayer({
  video,
  title,
  startSeconds,
  onPosition,
}: {
  video: VideoRef;
  title: string;
  startSeconds: number;
  /** A server action bound to the lesson; absent when progress isn't saved. Failures are ignored. */
  onPosition?: (positionSeconds: number | null) => Promise<void>;
}) {
  switch (video.provider) {
    case "youtube":
      return (
        <YouTubePlayer
          id={video.id}
          title={title}
          startSeconds={startSeconds}
          onPosition={onPosition}
        />
      );
    case "nas":
      return (
        <VideoFallback>
          The church video library isn&apos;t connected yet, so this video can&apos;t play here. The
          lesson text is below.
        </VideoFallback>
      );
  }
}

/** How often to save the position while playing. */
const SAVE_EVERY_MS = 30_000;
/** How long to wait for the YouTube player before showing the fallback. */
const LOAD_TIMEOUT_MS = 15_000;

// The parts of the YouTube IFrame Player API used here.
type YouTubePlayerInstance = { getCurrentTime(): number; destroy(): void };
type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: () => void;
      };
    },
  ) => YouTubePlayerInstance;
};
declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
const PAUSED = 2;
const ENDED = 0;

let apiPromise: Promise<YouTubeNamespace> | null = null;

/** Loads the official IFrame API once per page. */
function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  apiPromise ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) {
        resolve(window.YT);
      }
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("YouTube player did not load"));
    };
    document.head.append(script);
  });
  return apiPromise;
}

function YouTubePlayer({
  id,
  title,
  startSeconds,
  onPosition,
}: {
  id: string;
  title: string;
  startSeconds: number;
  onPosition?: (positionSeconds: number | null) => Promise<void>;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Read through refs so a page refresh (for example after Mark complete) doesn't reload the video.
  const report = useRef(onPosition);
  const start = useRef(startSeconds);
  useEffect(() => {
    report.current = onPosition;
  }, [onPosition]);

  useEffect(() => {
    const element = mount.current;
    if (!element) {
      return;
    }
    let player: YouTubePlayerInstance | null = null;
    let ready = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const save = () => {
      if (player && ready) {
        const seconds = player.getCurrentTime();
        if (Number.isFinite(seconds)) {
          void report.current?.(Math.floor(seconds)).catch(() => undefined);
        }
      }
    };
    const stopTimer = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const timeout = setTimeout(() => {
      if (!ready) {
        setFailed(true);
      }
    }, LOAD_TIMEOUT_MS);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) {
          return;
        }
        const target = document.createElement("div");
        element.replaceChildren(target);
        player = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: {
            rel: 0,
            playsinline: 1,
            start: resumeFrom(start.current),
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              ready = true;
              clearTimeout(timeout);
              element.querySelector("iframe")?.setAttribute("title", `Video: ${title}`);
            },
            onStateChange: ({ data }) => {
              if (data === PLAYING) {
                timer ??= setInterval(save, SAVE_EVERY_MS);
              } else if (data === PAUSED || data === ENDED) {
                stopTimer();
                save();
              }
            },
            onError: () => {
              clearTimeout(timeout);
              setFailed(true);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    window.addEventListener("pagehide", save);
    return () => {
      cancelled = true;
      save();
      stopTimer();
      clearTimeout(timeout);
      window.removeEventListener("pagehide", save);
      player?.destroy();
    };
  }, [id, title]);

  if (failed) {
    return (
      <VideoFallback>
        The video didn&apos;t load here.{" "}
        <a
          href={youtubeWatchUrl(id)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-light underline underline-offset-4"
        >
          Watch it on YouTube
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        , or read the lesson text below.
      </VideoFallback>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-card border border-border bg-card">
      <div ref={mount} className="size-full" />
    </div>
  );
}

function VideoFallback({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex aspect-video w-full items-center justify-center rounded-card border border-border bg-card p-6"
    >
      <p className="flex max-w-md gap-3 text-small text-text-secondary">
        <InfoIcon className="mt-0.5 size-5 shrink-0 text-text-muted" />
        <span>{children}</span>
      </p>
    </div>
  );
}
