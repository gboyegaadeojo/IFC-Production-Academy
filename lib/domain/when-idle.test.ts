import { describe, expect, it, vi } from "vitest";
import { whenIdle } from "./when-idle";

describe("waiting for a quiet moment", () => {
  it("uses the browser's idle time, with a limit on the wait", () => {
    const run = vi.fn();
    const requestIdleCallback = vi.fn();
    whenIdle(run, { setTimeout: vi.fn() as never, requestIdleCallback });
    expect(requestIdleCallback).toHaveBeenCalledWith(run, { timeout: 3000 });
    expect(run).not.toHaveBeenCalled();
  });

  it("waits briefly in browsers without it", () => {
    const run = vi.fn();
    const setTimeout = vi.fn();
    whenIdle(run, { setTimeout: setTimeout as never });
    expect(setTimeout).toHaveBeenCalledWith(run, 1000);
  });
});
