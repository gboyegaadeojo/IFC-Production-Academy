import type { Instrumentation } from "next";
import { SERVER_ERROR_REPORTER, type ServerErrorReporter } from "@/lib/domain/monitoring";

// Server errors reach Sentry through this hook. The Worker sets Sentry up and leaves a reporter on
// globalThis (workers/entry.ts), so the app doesn't bundle its own copy; with no address it's off.
// See docs/runbooks/monitoring.md.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const report = (globalThis as Record<string, unknown>)[SERVER_ERROR_REPORTER] as
    ServerErrorReporter | undefined;
  report?.(error, {
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
};
