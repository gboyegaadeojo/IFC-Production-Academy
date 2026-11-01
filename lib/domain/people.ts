/** The first word of a display name, for a friendly greeting. Falls back to the whole name. */
export function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
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
