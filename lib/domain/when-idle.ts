const LONGEST_WAIT_MS = 3000;

/**
 * Runs something once the browser has a quiet moment, so optional downloads such as error reporting
 * don't compete with the page starting up. Safari has no requestIdleCallback, so it waits briefly.
 */
export function whenIdle(
  run: () => void,
  target: Pick<typeof globalThis, "setTimeout"> & {
    requestIdleCallback?: (run: () => void, options: { timeout: number }) => unknown;
  } = globalThis,
): void {
  if (target.requestIdleCallback) {
    target.requestIdleCallback(run, { timeout: LONGEST_WAIT_MS });
  } else {
    target.setTimeout(run, 1000);
  }
}
