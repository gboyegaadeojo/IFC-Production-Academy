"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { channelsToShow, MIXER_CHANNELS } from "@/lib/domain/mixer";
import type { DashboardLayout } from "@/lib/domain/service-dashboard";
import { saveLayoutAction } from "../actions";

const GROUPS = [...new Set(MIXER_CHANNELS.map((channel) => channel.group))];
const LABELS = new Map(MIXER_CHANNELS.map((channel) => [channel.id, channel.number]));

export function ChannelPicker({ layout, canEdit }: { layout: DashboardLayout; canEdit: boolean }) {
  const [chosen, setChosen] = useState<string[]>(() => channelsToShow(layout.channels));
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string, on: boolean) {
    setChosen((all) => (on ? [...all, id] : all.filter((entry) => entry !== id)));
    setMessage(null);
  }

  function move(index: number, by: number) {
    setChosen((all) => {
      const next = [...all];
      const [item] = next.splice(index, 1);
      if (item !== undefined) {
        next.splice(index + by, 0, item);
      }
      return next;
    });
    setMessage(null);
  }

  function save() {
    startTransition(async () => {
      const result = await saveLayoutAction({ ...layout, channels: chosen });
      setMessage({
        text: result.ok ? "Channels saved." : result.message,
        failed: !result.ok,
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? null : (
        <p className="max-w-2xl rounded-card border border-warning-line bg-warning-soft p-3 text-small">
          Only editors can change these.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
          {GROUPS.map((group) => (
            <fieldset key={group} className="flex flex-col gap-1">
              <legend className="eyebrow text-text-muted">{group}</legend>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-x-3">
                {MIXER_CHANNELS.filter((channel) => channel.group === group).map((channel) => (
                  <label key={channel.id} className="flex items-center gap-2 py-0.5 text-small">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={chosen.includes(channel.id)}
                      onChange={(event) => toggle(channel.id, event.target.checked)}
                      className="size-6 shrink-0 accent-accent"
                    />
                    {channel.number}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
          <h2 className="text-heading font-semibold">Showing {chosen.length}, left to right</h2>
          {chosen.length === 0 ? (
            <p className="text-small text-text-secondary">
              Nothing chosen, so the tile shows the mains and the first channels.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {chosen.map((id, index) => {
                const label = LABELS.get(id) ?? id;
                return (
                  <li key={id} className="flex items-center justify-between gap-2 py-1 text-small">
                    {label}
                    {canEdit ? (
                      <span className="flex gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={`Move ${label} up`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          Up
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={`Move ${label} down`}
                          disabled={index === chosen.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          Down
                        </Button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
          {canEdit ? (
            <Button type="button" className="self-start" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save channels"}
            </Button>
          ) : null}
          <p
            role="status"
            className={`min-h-5 text-small ${message?.failed ? "text-error" : "text-text-secondary"}`}
          >
            {message?.text}
          </p>
        </div>
      </div>
    </div>
  );
}
