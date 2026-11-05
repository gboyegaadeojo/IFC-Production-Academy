// Browser errors go to Sentry once its address is set (docs/runbooks/monitoring.md). The SDK isn't
// downloaded until then, and nothing private leaves the browser (lib/domain/monitoring.ts). It
// downloads in a quiet moment, so it never competes with the page starting up.
import { scrubEvent, SENTRY_DATA_COLLECTION } from "@/lib/domain/monitoring";
import { whenIdle } from "@/lib/domain/when-idle";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  whenIdle(() => {
    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.init({
        dsn,
        dataCollection: SENTRY_DATA_COLLECTION,
        tracesSampleRate: 0,
        beforeSend: (event) => scrubEvent(event),
      });
    });
  });
}
