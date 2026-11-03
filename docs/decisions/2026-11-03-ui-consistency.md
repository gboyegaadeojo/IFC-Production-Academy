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
- **Exceptions:** printed certificates, the wall TV, the sign-in page's hero, and very small previews, such as slide thumbnails, keep their own sizes.

## The rest of the work

Tracked in the same review: saving without a Save button on each row, one width per page, fewer labels in the code-style font, the admin sidebar, showing status only when it matters, calmer actions in repeating rows, the person page on phones, and the Training home. The Planning Center page is redesigned on top of these rules.
