"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const WIDTH = 1600;
const HEIGHT = 900;

/**
 * Fits the dashboard to the whole TV with no scrolling (ADD-DASH-06). It lays out at one fixed size
 * and scales, so it looks the same on any screen. Keeps the current item in view, since a TV can't
 * be scrolled by hand.
 */
export function ScreenStage({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    const resize = () => {
      const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
      setFit({
        scale,
        x: (window.innerWidth - WIDTH * scale) / 2,
        y: (window.innerHeight - HEIGHT * scale) / 2,
      });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const keepInView = () => {
      const now = stage.current?.querySelector<HTMLElement>('[data-now="true"]');
      const body = now?.closest<HTMLElement>("[data-tile-body]");
      if (now && body) {
        body.scrollTop = Math.max(0, now.offsetTop - body.offsetTop - 50);
      }
    };
    keepInView();
    const timer = window.setInterval(keepInView, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg">
      <div
        ref={stage}
        className="service-stage absolute top-0 left-0 flex origin-top-left flex-col gap-2 p-2.5"
        style={{
          width: WIDTH,
          height: HEIGHT,
          transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
