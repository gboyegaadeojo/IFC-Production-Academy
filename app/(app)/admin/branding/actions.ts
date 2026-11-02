"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/data/auth";
import { type BrandingIcon, saveBranding } from "@/lib/data/branding";
import {
  BRAND_ICON_MAX_BYTES,
  BRAND_ICON_SIZE,
  brandingSchema,
  isSquarePng,
} from "@/lib/domain/branding";

export type BrandingResult = { ok: boolean; message: string };

const iconChoice = z.enum(["keep", "original", "new"]);

/** Saves the name and icon (ADD-DASH-04). The page makes a 512px PNG; this checks that it is one. */
export async function saveBrandingAction(formData: FormData): Promise<BrandingResult> {
  const names = brandingSchema.safeParse({
    name: formData.get("name"),
    shortName: formData.get("shortName"),
  });
  const choice = iconChoice.safeParse(formData.get("iconChoice"));
  if (!names.success || !choice.success) {
    return { ok: false, message: "Check the names: each needs at least one character." };
  }
  await requireActiveUser();

  let icon: BrandingIcon = { kind: "keep" };
  if (choice.data === "original") {
    icon = { kind: "original" };
  } else if (choice.data === "new") {
    const file = formData.get("icon");
    if (!(file instanceof File) || file.size > BRAND_ICON_MAX_BYTES) {
      return { ok: false, message: "That logo is too large. Try a simpler image." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isSquarePng(bytes, BRAND_ICON_SIZE)) {
      return { ok: false, message: "That logo couldn't be read. Try a PNG or JPEG file." };
    }
    icon = { kind: "new", bytes };
  }

  const result = await saveBranding(names.data.name, names.data.shortName, icon);
  if (!result.ok) {
    return {
      ok: false,
      message: "That didn't save. Check that your role allows this, then try again.",
    };
  }
  refresh();
  return {
    ok: true,
    message: "Saved. New installs get it now. See below for phones that already have the app.",
  };
}
