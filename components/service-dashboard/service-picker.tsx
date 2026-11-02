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
