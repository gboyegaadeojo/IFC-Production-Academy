/**
 * Asks GitHub to run a workflow (docs/runbooks/scheduling.md). GitHub's own schedule can run hours
 * late, so the Worker starts the frequent jobs itself, and the Refresh button uses this too. The
 * token is never logged. Failures say only which job and what status came back.
 */
export const DEFAULT_DISPATCH_REPO = "gboyegaadeojo/IFC-Production-Academy";

/** The jobs that promise "every 15 minutes". */
export const FREQUENT_WORKFLOWS = ["notifications.yml", "planning-center.yml"] as const;

type Dispatch = { token: string; repo: string };

/** True when GitHub accepted the request. Never throws. */
export async function dispatchWorkflow(
  workflow: string,
  { token, repo }: Dispatch,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ifc-production-academy",
        },
        body: JSON.stringify({ ref: "main" }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return { ok: response.status === 204, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Starts every frequent job, even if one fails, then throws if any did, so the failure reaches
 * Sentry. Without a token it does nothing, which keeps local runs and CI from calling GitHub.
 */
export async function startFrequentJobs(
  token: string | undefined,
  repo: string = DEFAULT_DISPATCH_REPO,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!token) {
    console.log("Scheduled jobs: GITHUB_DISPATCH_TOKEN is not set, so none were started.");
    return 0;
  }
  const results = await Promise.all(
    FREQUENT_WORKFLOWS.map(async (workflow) => ({
      workflow,
      ...(await dispatchWorkflow(workflow, { token, repo }, fetchImpl)),
    })),
  );
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    const detail = failed.map((f) => `${f.workflow} (HTTP ${f.status})`).join(", ");
    throw new Error(`Could not start scheduled jobs: ${detail}`);
  }
  return results.length;
}
