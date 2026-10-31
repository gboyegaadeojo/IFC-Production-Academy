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
