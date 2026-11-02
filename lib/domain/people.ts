/** The first word of a display name, for a friendly greeting. Falls back to the whole name. */
export function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/**
 * The first name to greet someone by, or null while their name is still the one made up at sign-up
 * (the part of their email before the @), so the page never says "Welcome back, sam.example".
 * Mirrors private.is_default_display_name in the database.
 */
export function greetingName(displayName: string, email: string | null): string | null {
  const name = displayName.trim();
  const local = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (name === "" || name === "New volunteer" || name.includes("@")) {
    return null;
  }
  if (local !== "" && name.toLowerCase() === local) {
    return null;
  }
  return firstName(name);
}

/** Up to two initials for an avatar, from a display name. Falls back to "?" for an empty name. */
export function initials(displayName: string): string {
  const words = displayName
    .trim()
    .split(/[\s._@-]+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "?";
  }
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = words.length > 1 ? (Array.from(words.at(-1) ?? "")[0] ?? "") : "";
  return (first + last).toLocaleUpperCase("en-CA");
}
