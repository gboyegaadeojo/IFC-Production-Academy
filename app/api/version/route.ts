import { NextResponse } from "next/server";

/**
 * The version that's live (next.config.ts stamps each build), so an app that's been open since an
 * older one knows to load the new one (components/shell/version-watcher.tsx). Never cached, no
 * sign-in, and nothing private: it's the commit the site was built from.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
