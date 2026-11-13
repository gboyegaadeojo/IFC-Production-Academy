"use client";

import { useOptimistic, useTransition } from "react";
import { setLoadedAction } from "@/app/(app)/cleared-actions";

/** The shared "Loaded" tick on the day (ADD-COPY-08). Everyone on duty sees the same tick. */
export function LoadedTick({
  requestId,
  loaded,
  label,
}: {
  requestId: string;
  loaded: boolean;
  label: string;
}) {
  const [shown, setShown] = useOptimistic(loaded);
  const [, startTransition] = useTransition();
  return (
    <label className="flex min-h-touch shrink-0 cursor-pointer items-center gap-2 text-small font-semibold">
      <input
        type="checkbox"
        checked={shown}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(async () => {
            setShown(next);
            await setLoadedAction(requestId, next);
          });
        }}
        className="size-5 accent-[var(--success)]"
      />
      Loaded
      <span className="sr-only">: {label}</span>
    </label>
  );
}
