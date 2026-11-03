# Decision: one set of sizes across the app (2026-11-03)

**Status:** decided by G, 2026-11-03, after a clickable review of the Planning Center page and marked-up screenshots of the app. It updates DESIGN-REQUIREMENTS §4.2 and §4.3.

## Why

G found the UI looked amateur because sizes didn't match: dropdowns were larger than the labels beside them, and pages had drifted apart. There was no single rule for text, fields and buttons.

## The rules

| Part | With a mouse | On a touch screen or phone |
| --- | --- | --- |
| Page title | 20px | 20px |
| Section heading | 15px | 15px |
| Body text | 13px | 14px on screens under 640px wide |
| Small text | 12px, nothing smaller | 12px |
| Fields and dropdowns | 32px tall, 13px text | 44px tall, 16px text |
| Buttons | 32px, or 28px for small ones, 13px text | 44px, 14px text |
| Corners | Cards 12px, controls 9px, pills round | The same |

- **Touch sizes follow the device, not the width.** A tablet is a touch screen, so it gets 44px controls and 16px field text. This meets SPEC §6's 44px rule, and iPhones and iPads zoom the page when a field's text is under 16px.
- **Dropdowns** use one arrow on every device.
- **Exceptions:** printed certificates, the wall TV, the sign-in page's hero, the public Serve with us page's heading, and very small previews, such as slide thumbnails, keep their own sizes.
- **One typeface for words.** Labels, counts and calendar dates use Inter. The code-style font stays only for things that are literally code or an exact string to copy: certificate references, invitation links, channel addresses, the wall TV's pairing code and clocks, and code samples in guides. The small label above a title (the eyebrow) is 12px, in Inter, in normal case.
- **One width per page.** The boxes on a page share one width. Paragraphs can stay narrower, for reading.
- **Status only when it matters.** On People and a person's page, only accounts that aren't active get a badge. Departments still show their status, because it's the setting being managed there.

## The Planning Center page

The page leads with the key numbers, then has tabs for position links, people not in the Academy, and who schedules. A link saves as soon as it's chosen. On a phone, each position is one compact row, and tapping it opens the phone's own picker. The two figures dropped from the top are people matched to an account and places on position teams.

## The rest of the work

The Planning Center page is redesigned on top of these rules.

- **Saving:** a choice, such as checkboxes or a dropdown, saves as soon as it changes. Typed text keeps its Save button, behind an Edit link where it repeats in a list, so nothing is saved halfway through a word.
- **Repeating rows:** one main button per row, with the rest behind **More**, starting with Membership requests.
- **A person's page:** a short role picker that shows what the chosen role allows, with no cards inside cards.

The sidebar's rows are now 32px with a mouse so its links fit on a laptop screen, and it still scrolls on very short screens. "Services & Scheduling" keeps its name, because it fits at the new text size.
