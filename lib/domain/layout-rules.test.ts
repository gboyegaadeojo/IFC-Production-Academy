import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phones get one column that can't be wider than the screen (SPEC §6, WCAG 1.4.10). A grid that
 * sets columns only from a breakpoint up (`grid lg:grid-cols-2`) has one automatic column below
 * it, and Safari lets that column grow to its widest content. On an iPhone the page then zoomed
 * out (the service checklist, 2026-11-10) or cut off its edge (Recently watched). Chrome keeps
 * the column to the screen, so tests in Chrome never saw it. Every such grid needs `grid-cols-1`
 * (one `minmax(0, 1fr)` column) or its own columns below the breakpoint.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const CLASS_TEXT = /(["`])([^"`]*\bgrid\b[^"`]*)\1/g;
const BREAKPOINT_COLUMNS = /^(sm|md|lg|xl|2xl|@[a-z]+):grid-cols-/;

/** Grids in a file that have columns only from a breakpoint up, as "path:line". */
export function breakpointOnlyGrids(path: string, text: string): string[] {
  return text.split("\n").flatMap((line, index) =>
    [...line.matchAll(CLASS_TEXT)]
      .map((match) => match[2]!.split(/\s+/))
      .filter(
        (tokens) =>
          tokens.includes("grid") &&
          tokens.some((token) => BREAKPOINT_COLUMNS.test(token)) &&
          !tokens.some((token) => token.startsWith("grid-cols-")),
      )
      .map(() => `${path}:${index + 1}`),
  );
}

describe("layouts fit a phone", () => {
  it("finds a grid with columns only from a breakpoint up, and passes one that has its own", () => {
    expect(breakpointOnlyGrids("x.tsx", '<ul className="grid gap-2 lg:grid-cols-2">')).toEqual([
      "x.tsx:1",
    ]);
    expect(
      breakpointOnlyGrids("x.tsx", '<ul className="grid grid-cols-1 lg:grid-cols-2">'),
    ).toEqual([]);
    expect(breakpointOnlyGrids("x.tsx", '<div className="grid grid-cols-[2rem_1fr]">')).toEqual([]);
  });

  it("every grid in the app has a phone-width column below its breakpoints", () => {
    const found = ["app", "components"]
      .flatMap(sourceFiles)
      .flatMap((path) => breakpointOnlyGrids(path, readFileSync(path, "utf8")));
    expect(found, "add grid-cols-1 so phones get one column no wider than the screen").toEqual([]);
  });
});
