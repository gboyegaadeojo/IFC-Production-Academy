# Decision: Service Dashboard, wall TV, and app name and logo (2026-11-02)

**Status:** decided by G, 2026-11-02, after the clickable mock. G has asked to see how it fits into the app before the build starts.

## Ask

G wants a live Service Producer dashboard like MXU's, shown on computers and a wall TV, and wants to be able to change the app's name and logo.

## Decided

- **One layout** for Service Producer, Audio, Graphics, Camera Director, and the wall TV.
- **Up to 3 editors** can change it. Everyone else views it.
- **Computers and the wall TV only.** Not on phones, and not in the installed app.
- **Monitoring only.** It reads from the gear and never controls slides, the mixer, or the encoder.
- **Mixer channels are chosen by editors,** in any order. X32 today, and the desk may change later.
- **The Slides tile shows 4 slides:** the one on screen and the next three.
- **Room loudness (SPL) is built and left off,** because there's no measurement mic or SMAART yet.
- **YouTube needs only the channel.** The stream is public, never unlisted, so no Google sign-in is needed.
- **YouTube live only (changed by G, 2026-11-03).** A tile says Live or Not live, which needs a free YouTube API key. Viewer counts on YouTube and Facebook were dropped, so there's no Facebook sign-in and no viewers on After the service.
- **The wall TV connects by code** and holds a view-only pass, not anyone's account. It's probably a Roku TV, so an Android TV or Google TV stick runs it over HDMI.
- **Church gear connects through a bridge** on a church computer that only connects outward.
- **Planning Center stays read-only.**
- **Name:** "Service Dashboard", because the Admin home is already called the admin dashboard.
- **Documentation:** new-people guides live in `docs/guides/` and change with the app (`CLAUDE.md`, "Documentation").

## Spec

- The dashboard isn't in SPEC yet. Requirement IDs (`ADD-DASH-…`) get added with the first build PR.
- **It goes ahead of the Phase 4 pilot.** SPEC §9 and `CLAUDE.md` say later work waits for earlier phases. G chose to build it now, so that doesn't block it.
- It keeps the product rules: training is shown and never a gate, every sensitive admin action writes an audit event, and access follows Planning Center teams.

## Limits

Not yet proven on real gear or accounts. `docs/guides/service-dashboard.md` lists these and is updated as they're tested.

- **ProPresenter:** slide status details, and whether it can send pictures of upcoming slides.
- **X32:** meter format and channel names.
- **Mixers:** dLive meter access is unconfirmed, and no documented way was found on the Waves LV1 Classic.
- **Free tier:** the estimate (720 requests and 1,800 GB-s of the Durable Object free limits for a 4-hour Sunday) has to be proven in testing.
- **Installed app icon and name:** Android and iPhone behaviour has to be tested on real phones.

## Volunteers

Nothing here invites or emails volunteers. That stays on hold until G says the app is finished.
