# Decision: team messaging with photos (2026-11-08)

**Status:** proposed by G, 2026-11-08. The plan below is waiting for G's approval, and the look and
the place in the navigation are chosen from mocks before any messaging screen is built. Until it's
switched on, nobody sees messaging.

## Ask

G wants teams to message each other in the Academy, with photos, while staying on free plans
(Supabase Free, Cloudflare free, Resend free):

- a chat for each department, and direct messages between two people, each seen only by its members
- text and photos; leaders delete any message in their department's chats, and people delete their
  own; every deletion goes in the audit log
- unread counts, and new messages appearing without a refresh

## What this changes

- **SPEC §1 Scope** listed "open messaging" as out of scope and §5 listed team messaging as a later
  module behind a feature flag. Messaging here stays closed: only a chat's members see it, there are
  no public channels, profiles, or feeds. It becomes an approved module, switched on with the first
  feature flag.
- **Decision 7 of [the open decisions](2026-10-31-open-decisions.md)** said no retention schedule or
  clean-up job. Chat photos get one: they're deleted after 90 days (an admin can change this),
  because free storage is 1 GB in total, shared with SOP files. Training and serving records are
  still kept, as decided.
- **Build order.** Messaging is a Phase 5 module, and the first pilot starts 17 Nov 2026. Like the
  [Service Dashboard](2026-11-02-service-dashboard.md), building it now needs G's go-ahead to run it
  alongside the pilot. Messaging stays switched off during the pilot unless G says otherwise.

## Design

### Feature flags (the first one)

- A `feature_flags` table: organisation, key, on or off, who changed it, and when. SPEC §5 already
  names FeatureFlag as a platform entity. Keys are a fixed list in code (`messaging` first), so a
  typo can't switch on something that doesn't exist.
- Platform Admins switch flags on **Admin → Settings → Features**, through capability
  `feature.manage`. Every change writes an audit event (SRS-AUDIT-001).
- A flag that's off hides the module everywhere: its pages, nav item, notification group, and help
  guide. The database checks it as well, so its functions refuse to run, and its rows can't be
  read, while it's off. Hiding a button is never the only check.

### Who sees what

| Chat | Members | Who can delete |
| --- | --- | --- |
| Department chat, one per active department, made automatically | People with an active membership of the department, and people holding `message.moderate` there (Department Leaders, Production Director, Platform Admin) | Anyone their own message; `message.moderate` holders any message in that department's chat |
| Direct message | Exactly two people, both active | Each person their own message. Nobody else reads or deletes them |

- **Department chats follow membership.** Joining a department, or being removed, changes who can see
  its chat straight away, with no copying of member lists. Someone removed loses access to the
  whole chat, including older messages.
- **Deleting** blanks the text and deletes the photos, and the message shows as "Message deleted"
  with who removed it ("Deleted by a leader"). The audit event records who deleted which message and
  when, never what it said.
- **Departments, rules and limits are data**: department chats come from the departments table, and
  nothing in code names a department.

### Data (migrations, each with row-level security and pgTAP tests)

| Table | Holds |
| --- | --- |
| `conversations` | Kind (department or direct), department for department chats, created at |
| `conversation_members` | Direct message members, and everyone's read position (last read message and time) and whether they've muted the chat |
| `messages` | Conversation, sender, text (up to 4,000 characters), reply-to (optional), created, edited, deleted at and by. A client-generated ID makes sending safe to retry (SRS-PROG-004) |
| `message_attachments` | Message, the full-size and thumbnail paths in Storage, width, height, bytes, and when the file was removed |

- **Row-level security on every table, deny by default** (SRS-RBAC-004). Reading a message needs
  access to its conversation, and writing goes through `security definer` functions that check
  membership, the feature flag, and capabilities. People never write to the tables directly.
- **Unread counts** come from each person's read position, as one query for the chat list and one for
  the badge.

### Live updates (Supabase Realtime, used for the first time)

- An open chat subscribes to its own new and changed messages through Realtime's Postgres Changes,
  filtered by conversation. Realtime checks row-level security for each person, so it never sends a
  message to someone who can't read it.
- **It subscribes only to the chat on screen**, and unsubscribes when the person leaves the chat or
  the tab is hidden. The unread badge doesn't use Realtime: it refreshes on each page load and once a
  minute while the tab is visible. One open chat is one connection, well within the free plan's 200
  at a time.
- If the connection drops, the chat says it's offline, keeps unsent messages, and catches up from
  the last message it has when it reconnects.
- CI starts local Supabase without Realtime today. The chat's end-to-end tests turn it on.

### Photos

- **Resized in the browser before upload:** at most 1,600 px on the longest side, WebP at about 80%
  quality, aiming under 300 KB. A second, small version (about 320 px, around 20 KB) is the thumbnail,
  because Supabase's own image resizing isn't on the free plan.
- **Up to 4 photos per message**, JPEG, PNG, HEIC (where the browser can read it) or WebP in; WebP out.
  Location and camera details are stripped because the image is redrawn.
- **A new private bucket, `chat-photos`,** opened with short-lived signed links (one minute), like SOP
  files. The chat shows thumbnails, and the full photo loads only when someone taps it, to save the 5
  GB of free monthly egress.
- **Cleanup:** a scheduled job deletes chat photos older than 90 days and marks them "Photo no longer
  available". Admins change the number of days on Admin → Settings → Features (30 to 365).
- **Backups leave chat photos out.** The weekly backup skips the `chat-photos` bucket, so the Shared
  Drive copies don't grow with them. Message text is in the database and is backed up as usual. A
  restore brings back the messages, but not photos.

### Notifications

- A **Messages** group joins Serving, Training and Leading in notification settings, with a choice for
  phone and for email, and a per-chat mute.
- **Batched, never one per message.** The job that already runs every 15 minutes gathers unread
  messages for each person and chat into one notice: "3 new messages in Camera team" or "2 new
  messages from Jordan". Nothing is sent for a chat the person has open, or has read since.
- **Phone first, email as backup**, as decided on [2026-11-05](2026-11-05-alerts.md): a phone alert
  for each batch, and an email only for someone with no phone alerts, at most one email per person
  every 4 hours, listing all their chats. Quiet hours (20:00 to 08:00) apply. With Resend's free 100
  emails a day, messages can't crowd out serving emails, because serving emails are sent first.
- Messages stay inside ADD-NOTIF-02: nothing is emailed or sent to phones before launch, except to
  named testers.

### Navigation

The five phone tabs are full (Training, Courses, Schedule, Checklist, SOPs). The mocks show where
Messages could go, and G chooses:

1. **Top bar:** a Messages button beside the bell, with an unread count. Tabs stay as they are.
2. **Merge Checklist and SOPs** into one "Serve" tab, and give the freed tab to Messages.
3. **Inside the bell panel:** two tabs, Alerts and Messages.

On a computer, Messages joins the side bar, either among the main items or at the bottom beside the
bell.

### Free-plan budget

| Limit (free plan) | Use |
| --- | --- |
| Supabase Storage, 1 GB in total | About 320 KB per photo with its thumbnail, so about 3,000 photos at once alongside SOP files. The 90-day cleanup keeps it there; a chat that's busier than about 30 photos a day needs a shorter time |
| Supabase egress, 5 GB a month | Thumbnails only in the chat (a screen of 30 is about 0.6 MB), and full photos on tap |
| Realtime, 200 connections at once | One per open chat |
| Resend, 100 emails a day | At most one message email per person every 4 hours, after serving emails |
| Cloudflare Workers | Photos go straight from the browser to Storage with a signed upload link, not through the Worker |

### Help and guides

A Messages guide in `docs/guides/`, listed in `lib/domain/help.ts`, and the notification and admin
guides updated. Guides are public, so they use made-up names.

## Mocks before the screens

Before any messaging screen is built, G compares three clickable mocks, each working on a phone and a
computer in light and dark mode:

- **A, inspired by Apple's Messages:** soft rounded bubbles, frosted headers, generous spacing, the
  system font, subtle motion, and photos in rounded tiles.
- **B, inspired by Uber:** bold black and white, large headings, flat surfaces, one strong accent, a
  tight grid, and big tap targets.
- **C, an Academy blend:** the best of A and B in the app's B+ look, with the side bar, tinted pills,
  department colours, and calmer buttons.

These are for feel only: no Apple or Uber logos, icons or screens, and IFC Production Academy's name
and department colours throughout. Each shows the chat list, a department chat with photos and a
leader's reply, writing a message with a photo uploading, the photo viewer, starting a direct message,
a leader deleting a message, the empty and offline states, and the Messages notification settings.
They also show the navigation choices above. The mocks live in `docs/mocks/messaging/`, with fake
people only, and one index page links them all. G's choice and any changes are recorded here before
the screens are built.

## Build order

Small pull requests, each with lint, typecheck and tests passing:

1. This decision and the SPEC changes.
2. Feature flags, and the migration timestamp rule: every new migration's timestamp must be later
   than the newest existing one (72 migrations are dated in the future and are already applied, so
   none are renamed). The rule goes in CLAUDE.md, and CI fails a pull request that breaks it.
3. Messaging tables, row-level security, and database tests.
4. The mocks, for G to choose from (they can be made alongside 2 and 3).
5. Live chat, text only, in the chosen design.
6. Photos.
7. Notifications.
8. The cleanup job and the backup change, with the backups runbook.
9. Polish, the guide, and help.

## Questions for G

1. **Start now, or after the pilot?** Building now means messaging work runs alongside the 17 Nov
   pilot. It stays switched off either way.
2. **Who can message whom directly?** Anyone active in the Academy (simplest), or only people who
   share a department?
3. **Can anyone read direct messages besides the two people?** The proposal says no. If IFC's
   child-safety policy needs leaders or admins to be able to see them, that changes the design.
4. **How long is message text kept?** The proposal keeps it, like other records, and deletes only
   photos after 90 days.
5. **Who's in a department chat?** The proposal says active members and the department's leaders.
   Should Planning Center team members who haven't joined the department in the Academy be in it
   too?
