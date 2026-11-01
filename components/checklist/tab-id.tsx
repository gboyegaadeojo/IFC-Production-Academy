"use client";

import { useEffect, useRef } from "react";

const KEY = "academy-tab-id";

/**
 * A random id for this browser tab, kept in the tab's session storage, so the activity log can
 * tell tabs apart (checklist app US-07a). It identifies the tab, never the person.
 */
export function getTabId(): string {
  try {
    let id = window.sessionStorage.getItem(KEY);
    if (!id) {
      id = window.crypto.randomUUID();
      window.sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** A hidden form field carrying this tab's id, filled in once the page is running. */
export function TabIdField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.value = getTabId();
    }
  }, []);
  return <input ref={ref} type="hidden" name="tabId" defaultValue="" />;
}
