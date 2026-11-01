import "server-only";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, parseAppearance, type Appearance } from "@/lib/domain/appearance";

/** This device's appearance (checklist app US-08a). */
export async function getAppearance(): Promise<Appearance> {
  return parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
}
