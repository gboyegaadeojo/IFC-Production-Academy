# Service Dashboard: setup

For whoever sets up the connections. New people should read [the guide](../guides/service-dashboard.md) instead.

The dashboard only reads. Nothing here can change a slide, the mixer, the encoder, or the stream.

## YouTube live status and preview

The stream is public, so nobody signs in and nothing expires.

1. **Channel ID:** in the Academy, go to Admin, Service Dashboard setup, Connections, and paste the channel ID. It starts with `UC`. The stream preview works from this alone.
2. **API key, for the YouTube live tile:**
   1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, or use the backups project.
   2. Enable **YouTube Data API v3**.
   3. Under Credentials, create an **API key**. Restrict it to YouTube Data API v3.
   4. Add it as a Cloudflare secret named `YOUTUBE_API_KEY` (Workers, the Academy, Settings, Variables and Secrets, as type Secret, or `wrangler secret put YOUTUBE_API_KEY`).

**How it stays free:** it only looks from 30 minutes before a service until 30 minutes after. It searches for the stream every 2 minutes at most until it finds it, then checks every 30 seconds at most, however many screens are open. Google allows about 100 searches a day, and each check of a found stream costs far less.

**Still to test on the real channel:** how soon after going live the search finds the stream.

The checks run while a screen is open during the service, so leave the wall TV on or a booth computer open.

## Wall TV

1. **Plug a small Android TV or Google TV stick into the TV's HDMI port.** A Roku TV can't run this by itself, because Roku has no proper web browser.
2. Install a full-screen browser app on the stick, and open `<the Academy's address>/screen`. The TV shows a 6-digit code.
3. On a phone or computer, sign in, go to Admin, Service Dashboard setup, Screens, and enter the code. This is for the editors and for whoever chooses them.
4. Set the app to open that address when the stick starts.
5. **On a Roku TV:** go to Settings, System, Power, Power on, and choose that HDMI input, so the TV returns to the dashboard after a power cut. The menu can differ by TV brand.

The TV holds a long-lived, view-only pass in a cookie, stored in the database only as a hash. To disconnect a TV, choose Remove beside it in Screens, and its pass stops working on its next refresh, within 30 seconds. If a TV's browser data is cleared, it shows a new code and needs adding again.

**Still to test on the real stick:** that it reopens by itself after a power cut, and that the text can be read from where people stand.

## The church bridge

The cloud can't reach the mixer, ProPresenter, or the Magewell, so a small program on a church computer reads them and sends the readings out. It only connects outward, so no ports open and no firewall changes are needed. It only reads: it never sends anything that can change a slide, the desk, or the encoder. It logs status and counts, never lyrics or names.

**1. Make a secret, and give it to the Academy.** Make a long random secret (for example `openssl rand -hex 32`). Add it as a Cloudflare secret named `LIVE_ROOM_SECRET` (or `wrangler secret put LIVE_ROOM_SECRET`). Keep a copy for step 3. Without it the live tiles say "Not connected yet", and nothing else changes.

**2. Put the program on a church computer** that stays on during services and is on the same network as the gear. It needs [Node.js 24](https://nodejs.org) and this repository, with no install step:

```bash
git clone https://github.com/gboyegaadeojo/IFC-Production-Academy.git
cd IFC-Production-Academy
```

**3. Try it with example readings first,** which needs no gear:

```bash
ACADEMY_URL=https://<the Academy's address> LIVE_ROOM_SECRET=<the secret> node bridge/main.ts --simulate
```

Node may print a warning about the module type. That is harmless.

The Slides, Timers, Levels, and Encoder tiles should fill with obviously fake readings. Stop it with Ctrl+C. A tile fades and says **Offline** about 10 seconds later.

**4. Point it at the real gear.** Leave out any you don't have, and that tile says it's not reachable:

| Setting | What it is |
| --- | --- |
| `X32_HOST` | The X32's IP address (it uses UDP port 10023) |
| `PROPRESENTER_URL` | `http://<its computer>:<port>`, with Network turned on in ProPresenter's preferences, where the port is shown |
| `MAGEWELL_URL` | `http://<the encoder's address>` |
| `MAGEWELL_USER`, `MAGEWELL_PASSWORD` | The encoder's sign-in, if it asks for one |

**5. Start it with the computer,** using Task Scheduler on Windows or a systemd service on Linux, with those settings as environment variables. Don't put the secret in a file inside this repository.

**To update it:** `git pull`, then restart it.

**Free tier:** one message a second for a 4-hour Sunday counts as about 720 requests of the Durable Object's 100,000 a day, and about 1,800 of its 13,000 GB-s. Sending to screens is free. Slide pictures only go when the slide changes.

### Still to test on the real gear

The bridge is built from each maker's documentation and tested with those documents' own examples, but it hasn't met the real gear yet. Check these first, using each tile:

- **X32:** the levels move, and channel names appear. Each of the desk's meter sets is documented, but note that it allows only a few clients at once.
- **ProPresenter:** the slide on screen and the next three are right, and pictures appear. Its published API and a client library disagree on one address, so the bridge tries both.
- **Magewell:** whether it needs a sign-in, and that streams show correctly. Its `is-use` and `result` fields are what the bridge reads for "Streaming".

### Another mixer

Levels come from `bridge/x32.ts`. The Allen & Heath dLive has a documented connection, though its meter access is unconfirmed. We found no documented way to read meters on the Waves LV1 Classic. Another desk needs its own reader reporting the same channel ids (`lib/domain/mixer.ts`). Until then, leave `X32_HOST` out, and the other tiles carry on.
