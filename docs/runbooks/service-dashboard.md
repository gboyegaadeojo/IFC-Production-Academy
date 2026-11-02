# Service Dashboard: setup

For whoever sets up the connections. New people should read [the guide](../guides/service-dashboard.md) instead.

The dashboard only reads. Nothing here can change a slide, the mixer, the encoder, or the stream.

## YouTube viewers and preview

The stream is public, so nobody signs in and nothing expires.

1. **Channel ID:** in the Academy, go to Admin, Service Dashboard setup, Connections, and paste the channel ID. It starts with `UC`. The stream preview works from this alone.
2. **API key, for viewer counts:**
   1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, or use the backups project.
   2. Enable **YouTube Data API v3**.
   3. Under Credentials, create an **API key**. Restrict it to YouTube Data API v3.
   4. Add it as a Cloudflare secret named `YOUTUBE_API_KEY` (Workers, the Academy, Settings, Variables and Secrets, as type Secret, or `wrangler secret put YOUTUBE_API_KEY`).

**How it stays free:** it only looks from 30 minutes before a service until 30 minutes after. It searches for the stream once a minute at most until it finds it, then reads the count every 30 seconds at most, however many screens are open. That's about 240 count reads for a 2-hour service, out of 10,000 units a day, plus a few searches out of YouTube's 100 a day.

**Still to test on the real channel:** how soon after going live the search finds the stream.

The counts are read while a screen is open during the service, so leave the wall TV on or a booth computer open.

## Wall TV

1. **Plug a small Android TV or Google TV stick into the TV's HDMI port.** A Roku TV can't run this by itself, because Roku has no proper web browser.
2. Install a full-screen browser app on the stick, and open `<the Academy's address>/screen`. The TV shows a 6-digit code.
3. On a phone or computer, sign in, go to Admin, Service Dashboard setup, Screens, and enter the code. This is for the editors and for whoever chooses them.
4. Set the app to open that address when the stick starts.
5. **On a Roku TV:** go to Settings, System, Power, Power on, and choose that HDMI input, so the TV returns to the dashboard after a power cut. The menu can differ by TV brand.

The TV holds a long-lived, view-only pass in a cookie, stored in the database only as a hash. To disconnect a TV, choose Remove beside it in Screens, and its pass stops working on its next refresh, within 30 seconds. If a TV's browser data is cleared, it shows a new code and needs adding again.

**Still to test on the real stick:** that it reopens by itself after a power cut, and that the text can be read from where people stand.
