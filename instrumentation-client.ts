// Browser errors go to Sentry once its address is set (docs/runbooks/monitoring.md). The SDK isn't
// downloaded until then, and nothing private leaves the browser (lib/domain/monitoring.ts).
import { scrubEvent, SENTRY_DATA_COLLECTION } from "@/lib/domain/monitoring";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      dataCollection: SENTRY_DATA_COLLECTION,
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
    });
  });
}
