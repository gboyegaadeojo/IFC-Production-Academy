import { describe, expect, it, vi } from "vitest";
import { dispatchWorkflow, FREQUENT_WORKFLOWS, startFrequentJobs } from "./job-trigger";

const REPO = "example/repo";

function fakeFetch(statusFor: (url: string) => number) {
  return vi.fn(
    async (url: string | URL | Request) => new Response(null, { status: statusFor(String(url)) }),
  ) as unknown as typeof fetch;
}

describe("dispatchWorkflow", () => {
  it("asks GitHub to run the workflow on main", async () => {
    const fetchImpl = fakeFetch(() => 204);
    expect(
      await dispatchWorkflow("job.yml", { token: "fake-token", repo: REPO }, fetchImpl),
    ).toEqual({ ok: true, status: 204 });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.github.com/repos/example/repo/actions/workflows/job.yml/dispatches",
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ ref: "main" }));
  });

  it("reports a refusal or a dropped connection without throwing", async () => {
    const dispatch = { token: "fake-token", repo: REPO };
    expect(
      await dispatchWorkflow(
        "job.yml",
        dispatch,
        fakeFetch(() => 401),
      ),
    ).toEqual({
      ok: false,
      status: 401,
    });
    const offline = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await dispatchWorkflow("job.yml", dispatch, offline)).toEqual({ ok: false, status: 0 });
  });
});

describe("startFrequentJobs", () => {
  it("starts every frequent job", async () => {
    const fetchImpl = fakeFetch(() => 204);
    expect(await startFrequentJobs("fake-token", REPO, fetchImpl)).toBe(FREQUENT_WORKFLOWS.length);
    expect(fetchImpl).toHaveBeenCalledTimes(FREQUENT_WORKFLOWS.length);
  });

  it("does nothing without a token", async () => {
    const fetchImpl = fakeFetch(() => 204);
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await startFrequentJobs(undefined, REPO, fetchImpl)).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("still tries the others when one fails, then reports which, without the token", async () => {
    const fetchImpl = fakeFetch((url) => (url.includes("notifications") ? 401 : 204));
    const error = await startFrequentJobs("fake-secret-token", REPO, fetchImpl).catch(
      (caught: unknown) => caught as Error,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(FREQUENT_WORKFLOWS.length);
    expect(String(error)).toContain("notifications.yml (HTTP 401)");
    expect(String(error)).not.toContain("planning-center");
    expect(String(error)).not.toContain("fake-secret-token");
  });
});
