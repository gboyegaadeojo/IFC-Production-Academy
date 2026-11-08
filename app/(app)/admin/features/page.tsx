import type { Metadata } from "next";
import { Suspense } from "react";
import { SwitchForm } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getFeatureFlags } from "@/lib/data/features";
import { FEATURES } from "@/lib/domain/features";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { setFeatureFlagAction } from "./actions";

export const metadata: Metadata = { title: "Features" };

export default function FeaturesPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading…" />}>
      <FeaturesContent />
    </Suspense>
  );
}

/**
 * Modules that can be switched on or off for everyone (ADD-FLAG-01). Platform Admins only; the
 * database checks and writes each change to the audit log.
 */
async function FeaturesContent() {
  const { allowed } = await getAdminAccess("features");
  if (!allowed) {
    return <AccessDenied />;
  }
  const flags = await getFeatureFlags();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">Features</h1>
        <p className="max-w-2xl text-text-secondary">
          Parts of the app you can switch on or off for everyone. While one is off, nobody sees it
          and the app won&apos;t let anyone use it. Each change goes in the audit log.
        </p>
      </header>
      <ul className="flex max-w-2xl flex-col gap-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.key}
            className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
          >
            <SwitchForm
              action={setFeatureFlagAction}
              hidden={{ key: feature.key }}
              name="enabled"
              checked={flags[feature.key]}
              label={feature.name}
            />
            <p className="text-small text-text-secondary">{feature.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
