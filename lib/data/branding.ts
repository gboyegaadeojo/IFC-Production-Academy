import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { brandIconUrl, type Branding, DEFAULT_BRANDING } from "@/lib/domain/branding";
import { publicEnv } from "@/lib/env";

/**
 * Every page shows the app's name, so it's held for a minute instead of read on each request. A
 * save clears it here, and other Worker instances catch up within the minute.
 */
const HOLD_MS = 60_000;
let held: { branding: Branding; until: number } | null = null;

async function readBranding(): Promise<Branding> {
  if (held && held.until > Date.now()) {
    return held.branding;
  }
  try {
    const env = publicEnv();
    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase.rpc("app_branding");
    const row = (
      data as { app_name: string; app_short_name: string; app_icon_path: string | null }[] | null
    )?.[0];
    if (error || !row) {
      return DEFAULT_BRANDING;
    }
    const branding = {
      name: row.app_name,
      shortName: row.app_short_name,
      iconPath: row.app_icon_path,
    };
    held = { branding, until: Date.now() + HOLD_MS };
    return branding;
  } catch {
    // The name must never be what takes a page down.
    return DEFAULT_BRANDING;
  }
}

/** The app's name and logo. Readable before signing in. Read at most once per request. */
export const getBranding = cache(readBranding);

export function iconUrlFor(branding: Branding): string | null {
  return branding.iconPath
    ? brandIconUrl(publicEnv().NEXT_PUBLIC_SUPABASE_URL, branding.iconPath)
    : null;
}

export type BrandingIcon =
  { kind: "keep" } | { kind: "original" } | { kind: "new"; bytes: Uint8Array };

/** Saves the name and icon. Only people with branding.manage get past the database. */
export async function saveBranding(
  name: string,
  shortName: string,
  icon: BrandingIcon,
): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const previous = (await readFresh()).iconPath;
  let iconPath = previous;
  if (icon.kind === "original") {
    iconPath = null;
  } else if (icon.kind === "new") {
    iconPath = `app-icon-${crypto.randomUUID()}.png`;
    const upload = await supabase.storage.from("branding").upload(iconPath, icon.bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (upload.error) {
      return { ok: false };
    }
  }
  const { error } = await supabase.rpc("set_app_branding", {
    p_name: name,
    p_short_name: shortName,
    p_icon_path: iconPath,
  });
  if (error) {
    return { ok: false };
  }
  held = null;
  if (previous && previous !== iconPath) {
    // Tidying up only: an old file left behind does no harm.
    await supabase.storage.from("branding").remove([previous]);
  }
  return { ok: true };
}

async function readFresh(): Promise<Branding> {
  held = null;
  return readBranding();
}
