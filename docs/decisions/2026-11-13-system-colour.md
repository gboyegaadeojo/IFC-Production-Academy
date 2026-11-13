# A system colour Admin can change

**Date:** 2026-11-13. **Decided by:** G, after trying the clickable mock ("A system colour you can change") and asking for it to be built exactly as shown.

## What we decided

The action colour (buttons, links, the current tab and highlights) is a setting, not a fixed purple. It sits in **Admin, App name and logo**, under the name and logo, for Platform Administrators (`branding.manage`).

- **Seven tested colours:** Purple (the original, and the default), Blue, Teal, Green, Orange, Rose and Graphite. Each has a light and a dark set, and a unit test checks every one.
- **Custom:** any `#rrggbb`. It's deepened until white text on it reaches 4.5 to 1, and its text shade is deepened (light) or lightened (dark) until it reads on every surface. The page names the shade it will use when it had to change.
- **The logo's dot** follows the colour, unless that's turned off. Off keeps the Signal Line purple.
- **It also colours** the installed app's theme colour (the manifest) and the buttons in every email (Calm and design A).
- **Unchanged:** department hues, the status colours, `--brand-purple` and `--brand-lavender`, printed certificates, and the built-in app icon artwork.

## How it works

- `organizations.app_colour` (a preset name or `#rrggbb`, checked by the database) and `app_colour_logo`. `app_branding()` returns them to anyone, as it does the name, and `set_app_colour()` needs `branding.manage`. The organizations audit trigger logs each change.
- The root layout adds a small style that overrides `--accent`, `--accent-light`, `--accent-soft` (and `--logo-accent`) for both themes. Purple adds nothing. Only values from `lib/domain/system-colour.ts` reach it, so nothing else can get into the page's styles.
- The colour is held with the name for up to a minute on each Worker, so most people see it straight away and everyone within a minute.

## What this changes

CLAUDE.md and DESIGN-REQUIREMENTS §4 said purple is the single action colour. It's still the single action colour, but it's whatever the setting is, purple by default. Components keep using only the tokens.
