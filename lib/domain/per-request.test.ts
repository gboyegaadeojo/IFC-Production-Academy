import { describe, expect, it, vi } from "vitest";
import { perRequestBatch } from "./per-request";

function setup() {
  const load = vi.fn(async (keys: readonly string[]) => {
    return new Map(keys.filter((key) => key !== "none").map((key) => [key, key.toUpperCase()]));
  });
  const store = new Map<string, Promise<string | undefined>>();
  return { load, read: perRequestBatch(() => store, load) };
}

describe("reading once per request", () => {
  it("reads only what hasn't been read yet", async () => {
    const { load, read } = setup();
    await read(["a", "b"]);
    const found = await read(["b", "c"]);
    expect(load.mock.calls.map(([keys]) => keys)).toEqual([["a", "b"], ["c"]]);
    expect([...found]).toEqual([
      ["b", "B"],
      ["c", "C"],
    ]);
  });

  it("shares a read already on its way", async () => {
    const { load, read } = setup();
    const [first, second] = await Promise.all([read(["a"]), read(["a"])]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first.get("a")).toBe("A");
    expect(second.get("a")).toBe("A");
  });

  it("remembers that something wasn't found, and leaves it out", async () => {
    const { load, read } = setup();
    expect((await read(["none"])).has("none")).toBe(false);
    expect((await read(["none"])).has("none")).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("makes no read when nothing is asked for", async () => {
    const { load, read } = setup();
    expect((await read([])).size).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("asks for each thing once, even when it's listed twice", async () => {
    const { load, read } = setup();
    await read(["a", "a"]);
    expect(load.mock.calls[0]?.[0]).toEqual(["a"]);
  });

  it("passes a failed read to everyone waiting for it", async () => {
    const store = new Map<string, Promise<string | undefined>>();
    const read = perRequestBatch(
      () => store,
      async () => {
        throw new Error("no");
      },
    );
    await expect(read(["a"])).rejects.toThrow("no");
    await expect(read(["a"])).rejects.toThrow("no");
  });

  it("starts fresh when the store is fresh, as it is for each new request", async () => {
    const load = vi.fn(async (keys: readonly string[]) => new Map(keys.map((key) => [key, key])));
    const read = perRequestBatch(() => new Map<string, Promise<string | undefined>>(), load);
    await read(["a"]);
    await read(["a"]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
