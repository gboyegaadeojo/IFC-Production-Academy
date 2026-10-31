# Notification emails

The Academy writes a notification when something happens for a person: joining a department,
being scheduled, a practical assessment result, a mentoring pairing, or an SOP they own coming
due for review. Everyone sees theirs in the app under **Notifications** (account menu), and
chooses which kinds also come by email.

Emails are sent every 15 minutes by `.github/workflows/notifications.yml`, which runs
`scripts/send-notifications.ts`. Until the secrets below are set, nothing is emailed and
notifications stay in the app.

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | What it is |
| --- | --- |
| `SUPABASE_URL` | Already set for the keep-alive job |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys → service role. Only ever an Actions secret: never in the app's runtime, the browser, the repo, or a log |
| `RESEND_API_KEY` | Already set for failure alerts |
| `NOTIFY_FROM` | The sender, for example `IFC Production Academy <academy@your-domain>`, on a domain verified in Resend |

The Academy's address for links in emails comes from the `SITE_URL` repository variable the
deploy workflow already uses.

## What the job does

1. Queues reminders (`queue_sop_review_reminders` and `queue_reminders`), each once:
   - SOP review due a week before the review date, and overdue a week after it;
   - "Please confirm" 48 hours after someone is scheduled, if they haven't answered;
   - "Serving soon" from 10:00 two days before an event, to the confirmed volunteer and their
     supervisor;
   - "Keep going" 7 and 21 days after someone last worked on a course they started;
   - a practical assessment request still open after 7 days, to the department's leaders;
   - a competency expiring within 30 days, where expiry is on.

   An assessment request also notifies the department's trainers the moment it's made.
   Times follow decision 8 in `docs/decisions/2026-10-31-open-decisions.md`.
2. Holds email during quiet hours, 20:00 to 08:00 Winnipeg time; it goes out at 08:00. Sign-in
   links aren't affected, because Supabase sends them.
3. Claims up to 50 pending emails at a time (`claim_email_notifications`), skipping kinds the
   person turned off and accounts that aren't active.
4. Sends each through Resend and records the result (`complete_email_notification`). A failed
   send is retried on the next runs, up to three attempts.

The job logs counts only: no addresses, names, or content. If every send in a run fails, the job
fails and the failure alert emails the admins.

## Check it works

- Run the workflow by hand (Actions → Notifications → Run workflow) and look for
  `Notification emails: N sent, 0 failed`.
- Schedule a test volunteer (an address you control), wait for the next run, and check the email
  arrives with a link back to the Academy.
