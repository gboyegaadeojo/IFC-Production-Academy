import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, Field, SwitchForm } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getFeatureFlags, getMessagingSettings } from "@/lib/data/features";
import { FEATURES } from "@/lib/domain/features";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { setFeatureFlagAction, setRetentionAction } from "./actions";

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
  const [flags, settings] = await Promise.all([getFeatureFlags(), getMessagingSettings()]);

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
            {feature.key === "messaging" ? (
              <ActionForm
                action={setRetentionAction}
                submitLabel="Save"
                pendingLabel="Saving…"
                className="mt-2 flex flex-col gap-3 border-t border-border pt-3"
              >
                <p className="text-small font-semibold">How long things are kept</p>
                <div className="flex flex-wrap gap-4">
                  <Field id="chat-file-days" label="Photos and documents (days)">
                    <input
                      id="chat-file-days"
                      name="chatFileDays"
                      type="number"
                      min={30}
                      max={365}
                      required
                      defaultValue={settings.chatFileDays}
                      className={`${fieldClasses} w-32`}
                    />
                  </Field>
                  <Field id="message-text-years" label="Message text (years)">
                    <input
                      id="message-text-years"
                      name="messageTextYears"
                      type="number"
                      min={1}
                      max={10}
                      required
                      defaultValue={settings.messageTextYears}
                      className={`${fieldClasses} w-32`}
                    />
                  </Field>
                </div>
                <p className="text-small text-text-muted">
                  A daily cleanup removes older photos and documents, and older messages, so the
                  Academy stays inside the free plan. The weekly summary warns when storage is 70%
                  full.
                </p>
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
