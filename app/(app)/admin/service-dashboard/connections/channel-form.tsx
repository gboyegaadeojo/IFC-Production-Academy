"use client";

import { useState, useTransition } from "react";
import { fieldClasses } from "@/components/ui/field-classes";
import { Button } from "@/components/ui/button";
import { setChannelAction } from "../actions";

export function ChannelForm({ initial }: { initial: string }) {
  const [channel, setChannel] = useState(initial);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setChannelAction({ channelId: channel });
          setMessage({ text: result.message, failed: !result.ok });
        });
      }}
    >
      <label htmlFor="youtube-channel" className="text-small font-medium text-text-secondary">
        Channel ID
      </label>
      <input
        id="youtube-channel"
        value={channel}
        aria-describedby="youtube-channel-hint"
        onChange={(event) => setChannel(event.target.value)}
        className={`${fieldClasses} font-mono`}
      />
      <p id="youtube-channel-hint" className="text-small text-text-muted">
        It starts with UC and is 24 characters. In YouTube Studio: Settings, then Channel, then
        Advanced settings.
      </p>
      <Button type="submit" variant="secondary" className="self-start" disabled={pending}>
        Save channel
      </Button>
      <p
        role="status"
        className={`min-h-5 text-small ${message?.failed ? "text-error" : "text-text-secondary"}`}
      >
        {message?.text}
      </p>
    </form>
  );
}
