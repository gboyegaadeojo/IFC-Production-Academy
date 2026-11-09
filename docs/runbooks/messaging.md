# Messaging setup

How team messaging is switched on and set up (the team messaging decision of 8 November 2026). The guide for people using it is [Messages](../guides/messages.md).

## Switching it on

A Platform Administrator turns on **Messages** under **Admin → Features**. While it's off, nobody sees Messages, and the database refuses to send or show anything. Switching it is recorded in the audit log.

## GIFs (GIPHY)

GIF search uses GIPHY's free plan, through the Academy's server, rated G only.

1. Sign in at developers.giphy.com and choose **Create an App**, then **API**, platform **Web**. Name it after the Academy.
2. Copy the API key it shows.
3. In Cloudflare, open **Workers & Pages**, the Academy's worker, **Settings → Variables and Secrets**, and add a **Secret** named `GIPHY_API_KEY`. Never put the key in the repository, an issue, or a chat.

Without the key, the GIF choice says GIFs aren't set up yet, and everything else works. A new GIPHY key allows 100 searches an hour. The app waits until typing stops and keeps results for five minutes, which is plenty for the team. Sent GIFs are GIPHY's address, not a file, so they use no storage.

## Photos and documents

- **Where they're kept:** the private `chat-files` bucket in Supabase Storage. Each file sits under its chat's id, and only people who can read that chat can upload into it or open it. Links last one minute.
- **Photos:** made smaller in the browser to at most 1,600 px (WebP, or JPEG on older Safari), with a 320 px thumbnail. Chats load thumbnails; the full photo loads only when tapped.
- **Documents:** PDF, Word, Excel, PowerPoint and plain text, up to 10 MB, checked by name and by their first bytes in the browser and again on the server. They open as downloads.
- **How long:** 90 days. The cleanup job that removes them, and leaving them out of the weekly backup, come in the next step of the build.

## Free plan budget

Supabase Free has 1 GB of file storage, shared with SOP files, and 5 GB of downloads a month. A photo with its thumbnail is about 300 KB, so the 90-day cleanup keeps chats well inside the limit unless the team shares more than about 30 photos a day. The weekly summary will warn at 70% once that step is built.
