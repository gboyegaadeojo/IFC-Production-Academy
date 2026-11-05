import { getBranding } from "@/lib/data/branding";
import { brandIconUrl } from "@/lib/domain/branding";
import { publicEnv } from "@/lib/env";

/**
 * The app's current icon at one address that never changes, for emails (decision 2026-11-05).
 * Emails already sent keep showing whatever logo is current, and the sign-in template pasted into
 * Supabase never needs changing for a new logo. Public, like the logo itself.
 */
export async function GET(request: Request) {
  const branding = await getBranding();
  if (branding.iconPath) {
    try {
      const icon = await fetch(
        brandIconUrl(publicEnv().NEXT_PUBLIC_SUPABASE_URL, branding.iconPath),
      );
      if (icon.ok) {
        return new Response(icon.body, {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
        });
      }
    } catch {
      // Fall back to the original icon below.
    }
  }
  return Response.redirect(new URL("/icons/icon-192.png", request.url), 302);
}
