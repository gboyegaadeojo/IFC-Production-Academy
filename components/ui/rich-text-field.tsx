"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// The editor is heavy, and only course builders need it, so it loads with the form.
const RichTextEditor = dynamic(() => import("./rich-text-editor"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      className="min-h-40 rounded-button border border-border-strong bg-surface"
    />
  ),
});

/**
 * A word-processor-style field inside a form (SRS-CUR-016). The hidden input carries the text as
 * Markdown, so it saves like any other field. Going over the limit shows here, and saving refuses it.
 */
export function RichTextField({
  id,
  name,
  label,
  defaultValue,
  maxLength,
  describedBy,
  minHeight = "min-h-40",
}: {
  id: string;
  name: string;
  /** The field's name for screen readers and tests. A form label can't point at an editor. */
  label: string;
  defaultValue: string;
  maxLength: number;
  describedBy?: string;
  minHeight?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const over = value.length > maxLength;
  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name={name} value={value} />
      <RichTextEditor
        id={id}
        label={label}
        initial={defaultValue}
        describedBy={describedBy}
        minHeight={minHeight}
        onChange={setValue}
      />
      <p className={`tabular text-right text-small ${over ? "text-error" : "text-text-muted"}`}>
        {over ? "Too long to save: " : ""}
        {value.length.toLocaleString("en-CA")} of {maxLength.toLocaleString("en-CA")} characters
      </p>
    </div>
  );
}
