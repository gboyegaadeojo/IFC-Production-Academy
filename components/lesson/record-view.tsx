"use client";

import { useEffect, useRef } from "react";

/**
 * Records that the learner opened the lesson, once per visit (SRS-PROG-001). Renders nothing.
 * Kept out of server rendering so prefetching or crawling a page never counts as a visit.
 */
export function RecordView({ record }: { record: (position: null) => Promise<void> }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) {
      return;
    }
    done.current = true;
    void record(null).catch(() => undefined);
  }, [record]);
  return null;
}
