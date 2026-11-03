"use client";

import { useRouter } from "next/navigation";

/** Which service the dashboard shows. It opens today's or the next one by itself. */
export function ServicePicker({
  current,
  services,
}: {
  current: string;
  services: { id: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-border bg-surface px-3 py-1.5">
      <label htmlFor="dashboard-service" className="text-[0.6875rem] text-text-muted">
        Service
      </label>
      <select
        id="dashboard-service"
        value={current}
        onChange={(event) => router.push(`/service-dashboard?service=${event.target.value}`)}
        className="max-w-full bg-transparent font-medium"
      >
        {services.map((service) => (
          <option key={service.id} value={service.id} className="bg-surface text-text">
            {service.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Which past service After the service shows. */
export function ReviewPicker({
  current,
  services,
}: {
  current: string;
  services: { id: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <div className="flex max-w-xl flex-col gap-1">
      <label htmlFor="review-service" className="text-small font-medium text-text-secondary">
        Service
      </label>
      <select
        id="review-service"
        value={current}
        onChange={(event) => router.push(`/service-dashboard/review?service=${event.target.value}`)}
        className="min-h-touch rounded-button border border-border-strong bg-card px-2"
      >
        {services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.label}
          </option>
        ))}
      </select>
    </div>
  );
}
