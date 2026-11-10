"use client";

import { useState, useTransition } from "react";
import { fieldClasses } from "@/components/ui/field-classes";
import { Button } from "@/components/ui/button";
import { addScreenAction, removeScreenAction } from "../actions";

export function ScreenControls({
  screens,
}: {
  screens: { id: string; name: string; detail: string }[];
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("Booth wall TV");
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addScreenAction({ code, name });
      setMessage({ text: result.message, failed: !result.ok });
      if (result.ok) {
        setCode("");
      }
    });
  }

  function remove(id: string, label: string) {
    startTransition(async () => {
      const result = await removeScreenAction({ id, name: label });
      setMessage({ text: result.message, failed: !result.ok });
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <form
        onSubmit={add}
        className="flex flex-col gap-3 rounded-card border border-border bg-card p-4"
      >
        <h2 className="text-heading font-semibold">Add a screen</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="screen-code" className="text-small font-medium text-text-secondary">
            Code on the TV
          </label>
          <input
            id="screen-code"
            value={code}
            inputMode="numeric"
            autoComplete="off"
            onChange={(event) => setCode(event.target.value)}
            className={`${fieldClasses} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="screen-name" className="text-small font-medium text-text-secondary">
            Screen name
          </label>
          <input
            id="screen-name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className={fieldClasses}
          />
        </div>
        <Button type="submit" className="self-start" disabled={pending}>
          Add this screen
        </Button>
      </form>

      <p
        role="status"
        className={`min-h-5 text-small ${message?.failed ? "text-error" : "text-text-secondary"}`}
      >
        {message?.text}
      </p>

      <section aria-labelledby="screens-heading" className="flex flex-col gap-2">
        <h2 id="screens-heading" className="text-heading font-semibold">
          Connected screens
        </h2>
        {screens.length === 0 ? (
          <p className="text-text-secondary">No screens yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
            {screens.map((screen) => (
              <li key={screen.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  {screen.name}
                  <span className="block text-small text-text-muted">{screen.detail}</span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  aria-label={`Remove ${screen.name}`}
                  onClick={() => remove(screen.id, screen.name)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
