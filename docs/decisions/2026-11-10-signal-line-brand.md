# Signal Line: the Academy's own logo (2026-11-10)

**Decided by:** G, after approving a clickable mock of web, phone and the installed app.
**Replaces:** the name-and-lockup and logo-file parts of decision 4 in
[2026-10-31-open-decisions.md](2026-10-31-open-decisions.md). The name stays "IFC Production
Academy"; the IFC pillars-and-dove mark is no longer used in the app.

## The mark

One continuous line that rises in three steps to a dot, drawn on a 96 by 96 grid. Its geometry is
fixed: never redraw it.

- Line: `M14 84V60A8.5 8.5 0 0 1 31 60V70A8.5 8.5 0 0 0 48 70V46A8.5 8.5 0 0 1 65 46V56A8.5 8.5 0 0 0 82 56V30`, stroke 10, round caps.
- Dot: centre 82, 14, radius 7.
- At 16 pixels only (favicons), stroke 11 and radius 8.

## Colours

The dot is the only accent; nothing else in the mark is ever coloured.

| Surface | Line | Dot and "ACADEMY" |
| --- | --- | --- |
| Light | #000000 | #7C3AED |
| Dark | #F5F5F5 | #B69BFF |
| Purple (#7C3AED) | #F5F5F5 | #F5F5F5 |
| Monochrome | one colour | the same colour |

## Wordmark

"IFC Production" in Inter 600, letter-spacing −0.03em, with "ACADEMY" below in Inter 600, capitals,
letter-spacing 0.46em, in the accent colour. The mark sits to the left, 22 pixels away at a
104-pixel mark, scaled in proportion. The app draws the outlined wordmark from the approved artwork,
so it never depends on a font loading.

## Where each form is used (G's choices, 2026-11-10)

1. **The full logo only at 52 pixels tall or more** (the sign-in page). Smaller, "ACADEMY" falls
   below 7 pixels and can't be read, so the **mark alone** is used in the side bar (open or folded),
   the phone's top bar, the admin side bar and the wall TV. Slim headers on public pages (help,
   invitations, certificate checks) show the mark with the name in readable type.
2. **The phone's top bar shows the mark only.**
3. **The installed app's `theme_color` is the brand purple**, which tints it in the phone's app
   switcher. Inside the app, each page's theme-color tag still matches the page's own background.
4. **The browser-tab icon follows the browser's theme**: `public/icon.svg` swaps to the light line
   on a dark browser. `favicon.ico` (16, 32, 48) is the light version, for older browsers.
5. **The opening (splash) screen uses the app's light background** (#f6f5fa), its default theme.

## Admin, Branding still wins

A logo or a new name chosen in **Admin, App name and logo** (ADD-DASH-04) replaces Signal Line in
the app and on the installed app. A new name alone keeps the Signal Line mark but drops the
wordmark, which spells the default name. Choosing **Original** brings Signal Line back. The Open
Graph image (link previews) is a fixed file and always shows Signal Line.

## Files

- Sources: `public/brand/signal-line/svg/logo-horizontal-light.svg` (the approved artwork) and the
  mark in `scripts/build-brand-assets.mjs`. `npm run brand:build` writes every other colourway, the
  PNGs, `favicon.ico`, `public/icon.svg`, `app/opengraph-image.png` and
  `lib/generated/brand-paths.ts`.
- In the app: `<Logo>` in `components/brand/logo.tsx` (mark, horizontal, stacked; auto, light,
  dark, mono), and `BrandMark` and `BrandLogo` in `components/brand/index.tsx`, which respect Admin,
  Branding. Colours are the `--logo-ink` and `--logo-accent` tokens in `app/globals.css`.
- Emails show the app icon as a hosted PNG (`/brand/icon`), never SVG.
