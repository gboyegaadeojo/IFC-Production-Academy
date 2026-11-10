// Field styles, kept apart from action-form.tsx: that file is browser code, so a server page that
// imported these from it got a reference to it, not the text, and `${fieldClasses} py-2` rendered
// as code instead of the styles.

export const fieldClasses =
  "min-h-control rounded-button border border-border-strong bg-surface px-3 text-field text-text placeholder:text-text-muted";

/** Smaller fields for a row of filters. Touch screens keep their full size, as iPhones zoom below 16px. */
export const compactFieldClasses =
  "min-h-8 rounded-button border border-border-strong bg-surface px-2.5 text-small text-text placeholder:text-text-muted pointer-coarse:min-h-11 pointer-coarse:text-field";
