"use client";

import { useLayoutEffect } from "react";

/**
 * The wall TV is always the true black theme. Nobody signs in on it to choose, and it's in a
 * darkened booth (ADD-DASH-06).
 */
export function AlwaysDark() {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);
  return null;
}
