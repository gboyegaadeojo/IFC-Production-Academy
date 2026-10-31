# Church video library (UniFi NAS)

Lessons can play training videos stored on the church's UniFi NAS, as well as unlisted YouTube
videos (decided 2026-10-30). This page is for whoever sets it up at IFC. It contains no hostnames,
addresses, or credentials, and none should ever be added to this repository.

## How it works

```
Volunteer's browser
  → the Academy (Cloudflare Worker): checks they're signed in and may read the lesson
  → Cloudflare Tunnel hostname, protected by Cloudflare Access (service token only)
  → cloudflared and a read-only file server on a small computer at church
  → the NAS training-videos share, mounted read-only
```

- The browser only ever sees `/media/lessons/<lesson id>` on the Academy. It never sees the NAS,
  the tunnel hostname, or a file path. The link can't be shared: it plays only for someone signed
  in who may read that lesson, which makes it suitable for restricted material (SRS-SOP-006).
- Every request is checked, including each part of the video the player asks for while seeking.
- Until it's set up, leaders can still add library file paths to lessons. Learners see "The church
  video library isn't connected yet".

## What you need

- **A small always-on computer on the church network**, such as a Raspberry Pi 4 or 5, an old
  mini PC, or any Docker host. The UniFi NAS may not be able to run the tunnel itself.
- **A NAS account just for this**, with read-only access to one share or folder that holds only
  the exported training videos. Don't share the whole NAS.
- The church's **Cloudflare account** (the one that hosts the Academy). Tunnel and Access are on
  the free plan (Access is free for up to 50 users; this uses one service token).

## Setup

1. **Export the videos for the web.** Use MP4 with H.264 video and AAC audio, about 720p at 2–3
   Mbit/s, and turn on "fast start" (web optimised) so playback begins before the whole file
   arrives. WebM also works. Use simple file names: letters, numbers, spaces, `.`, `_`, `-`.
   Organise by department and level, for example `camera/level-1/framing.mp4`.
2. **Mount the share read-only** on the small computer (SMB or NFS), for example at
   `/srv/training-videos`.
3. **Run a read-only file server on localhost only**, such as Caddy:

   ```
   :8080 {
     bind 127.0.0.1
     root * /srv/training-videos
     file_server        # no "browse": directory listings stay off
   }
   ```

4. **Create a Cloudflare Tunnel** (Zero Trust → Networks → Tunnels) and install `cloudflared` on
   the computer as a service. Add a public hostname on the church's domain that points to
   `http://127.0.0.1:8080`.
5. **Protect the hostname with Cloudflare Access** (Zero Trust → Access → Applications →
   Self-hosted). Add one policy, with action **Service Auth**, that allows only a new service token
   named for the Academy. Don't add any email or "everyone" rules. Copy the token's client ID and
   secret once; Cloudflare doesn't show the secret again.
6. **Give the Academy the three secrets** (Workers → the Academy → Settings → Variables and
   Secrets, as type Secret, or `wrangler secret put`):
   - `MEDIA_ORIGIN_URL`: `https://` plus the tunnel hostname.
   - `MEDIA_ACCESS_CLIENT_ID` and `MEDIA_ACCESS_CLIENT_SECRET`: from step 5.

   Don't put them in GitHub, an issue, a chat, or this repository.
7. **Check it.**
   - Add a library file to a test lesson, publish it, and play it as a member, seeking back and
     forward.
   - Then open the same lesson address while signed out, and as someone outside the department:
     both must fail.
   - Opening the tunnel hostname directly in a browser must show the Access block page.

## Things to know

- **Bandwidth.** Every viewer streams from the church's internet connection. At about 2.5 Mbit/s
  per viewer, a 20 Mbit/s upload serves roughly 6–8 people at once. Measure the church's upload
  speed before the pilot, and keep popular, non-sensitive videos on unlisted YouTube if needed.
- **Downtime.** If the small computer, the NAS, or the church internet is down, library videos
  show "The church video library isn't reachable right now" and the lesson text still works.
- **Cloudflare's terms.** Check Cloudflare's current terms for serving video through Workers and
  Tunnel before go-live. Training volume is small, but this needs confirming, not assuming.
- **Rotating the token.** Create a new service token, add it to the Access policy, update the two
  secrets, then delete the old token.
- **Logs** record only status codes and timings, never file paths, people, or tokens.
