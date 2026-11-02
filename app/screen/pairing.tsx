"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand";

/** What a TV shows until an editor approves it: a code, large enough to read across a room. */
export function ScreenPairing() {
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    async function start() {
      try {
        const response = await fetch("/screen/pair", { method: "POST" });
        const body = (await response.json()) as { status: string; code?: string };
        if (stopped) {
          return;
        }
        if (!response.ok || !body.code) {
          setFailed(true);
          timer = window.setTimeout(() => void start(), 30_000);
          return;
        }
        setFailed(false);
        setCode(body.code);
        timer = window.setTimeout(() => void check(), 3000);
      } catch {
        if (!stopped) {
          setFailed(true);
          timer = window.setTimeout(() => void start(), 30_000);
        }
      }
    }

    async function check() {
      try {
        const response = await fetch("/screen/claim", { method: "POST" });
        const body = (await response.json()) as { status: string };
        if (stopped) {
          return;
        }
        if (body.status === "approved") {
          window.location.reload();
          return;
        }
        if (body.status === "expired") {
          void start();
          return;
        }
      } catch {
        // The network dropped. Keep trying: the code stays good for 15 minutes.
      }
      if (!stopped) {
        timer = window.setTimeout(() => void check(), 3000);
      }
    }

    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
      <BrandMark height={72} />
      <h1 className="text-[3rem] leading-tight font-semibold">Connect this screen</h1>
      {failed ? (
        <p role="status" className="text-2xl text-text-secondary">
          Can&apos;t reach the Academy right now. This keeps trying.
        </p>
      ) : (
        <>
          <p
            aria-label={code ? `Your code is ${code.split("").join(" ")}` : "Getting a code"}
            className="font-mono text-[7rem] leading-none font-bold tracking-widest"
            data-testid="screen-code"
          >
            {code ? `${code.slice(0, 3)} ${code.slice(3)}` : "··· ···"}
          </p>
          <p className="text-2xl max-w-3xl text-text-secondary">
            On your phone or computer, sign in, go to Admin, then Service Dashboard setup, then
            Screens, and enter this code.
          </p>
        </>
      )}
    </main>
  );
}
