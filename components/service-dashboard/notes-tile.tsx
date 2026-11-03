"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveNoteAction } from "@/app/(app)/service-dashboard/actions";

/**
 * Shared notes for this service (ADD-DASH-05). Saved when you click away. Teammates' changes appear
 * with the page's next refresh, unless you're typing here, so nobody loses what they're writing.
 */
export function NotesTile({ eventId, body }: { eventId: string; body: string }) {
  const [text, setText] = useState(body);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [, startSaving] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(body);

  useEffect(() => {
    saved.current = body;
    if (document.activeElement !== field.current) {
      setText(body);
    }
  }, [body]);

  function save() {
    if (text === saved.current) {
      return;
    }
    startSaving(async () => {
      const result = await saveNoteAction({ eventId, body: text });
      if (result.ok) {
        saved.current = text;
      }
      setMessage({ text: result.message, failed: !result.ok });
    });
  }

  return (
    <>
      <label htmlFor="producer-notes" className="text-small text-text-muted">
        Shared with the team
      </label>
      <textarea
        id="producer-notes"
        ref={field}
        value={text}
        maxLength={4000}
        onChange={(event) => {
          setText(event.target.value);
          setMessage(null);
        }}
        onBlur={save}
        className="min-h-16 w-full flex-1 resize-none rounded-button border border-border-strong bg-card p-2 text-small"
      />
      <p
        role="status"
        className={`min-h-4 text-small ${message?.failed ? "text-error" : "text-text-muted"}`}
      >
        {message?.text}
      </p>
    </>
  );
}
