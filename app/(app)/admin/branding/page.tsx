import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getBranding, iconUrlFor } from "@/lib/data/branding";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { BrandingForm } from "./branding-form";
import { ColourForm } from "./colour-form";

export const metadata: Metadata = { title: "App name and logo" };

export default function BrandingPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading…" />}>
      <BrandingContent />
    </Suspense>
  );
}

/**
 * The app's name, logo and system colour (ADD-DASH-04; colour G, 2026-11-13). Platform
 * administrators; the database checks and logs.
 */
async function BrandingContent() {
  const { allowed } = await getAdminAccess("branding");
  if (!allowed) {
    return <AccessDenied />;
  }
  const branding = await getBranding();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">App name and logo</h1>
        <p className="max-w-2xl text-text-secondary">
          How the app looks on phones and in browsers. The previews update as you type.
        </p>
      </header>
      <BrandingForm
        initialName={branding.name}
        initialShortName={branding.shortName}
        currentIconUrl={iconUrlFor(branding)}
      />
      <ColourForm initialColour={branding.colour} initialLogo={branding.colourLogo} />
    </div>
  );
}
