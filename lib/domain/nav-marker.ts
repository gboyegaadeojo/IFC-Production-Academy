/** A header link's side padding (px-3): the underline lines up with its words, not its edges. */
const LINK_PADDING = 12;

/** Where the header's sliding underline sits under a link, measured from the start of the list. */
export function navMarkerPosition(
  link: { left: number; width: number },
  list: { left: number },
): { x: number; width: number } {
  return {
    x: link.left - list.left + LINK_PADDING,
    width: Math.max(0, link.width - LINK_PADDING * 2),
  };
}
