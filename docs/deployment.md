# Deploying the Academy

How to put your own copy of the Academy online. It's done once, by whoever runs it. Every service
below has a free plan that covers a church-sized team.

Keep every secret out of the repository: in GitHub Actions secrets and Cloudflare, never in code,
commits or issues.

## 1. Supabase (database, sign-in and files)

1. Create a project, then link it and push the schema:
   `npx supabase link` and `npx supabase db push`. This creates the organization, departments,
   roles and permissions. Never run `seed.sql` (fake people) against a real project.
2. **Authentication → URL configuration:** set the Site URL to the app's address, and add
   `https://<your-app>/auth/callback` and `https://<your-app>/auth/confirm` as redirect URLs.
3. **Authentication → SMTP:** send through Resend (`smtp.resend.com`, port 465, user `resend`, a
   Resend API key as the password, and a sender on a domain you've verified in Resend). Do this
   before step 4.
4. **Sign-in emails:** see [the notifications runbook](runbooks/notifications.md#sign-in-emails).
   Until that's set up, paste [supabase/templates/magic-link.html](../supabase/templates/magic-link.html)
   into Authentication → Email templates → Magic link (and Confirm signup).
5. **Your first administrator:** sign in once, then give that account the `platform_admin` role
   with SQL (a row in `public.user_roles` with no department). Everyone after that is given roles
   in the app.

## 2. Cloudflare (hosting)

The `deploy.yml` workflow builds and deploys on every push to `main`, or when run by hand. Create
an API token in the Cloudflare dashboard (**My Profile → API Tokens → "Edit Cloudflare Workers"
template**), limited to your account.

## 3. GitHub Actions secrets and variables

| Name                       | Kind     | Used for                                   |
| -------------------------- | -------- | ------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`     | Secret   | Deploying                                  |
| `CLOUDFLARE_ACCOUNT_ID`    | Secret   | Deploying                                  |
| `SUPABASE_URL`             | Secret   | Deploying, and the daily keep-alive        |
| `SUPABASE_PUBLISHABLE_KEY` | Secret   | Deploying, and the daily keep-alive        |
| `RESEND_API_KEY`           | Secret   | Emails when a scheduled job fails          |
| `ALERT_EMAILS`             | Secret   | Who gets those emails (comma-separated)    |
| `ALERT_FROM`               | Secret   | The sender for those emails                |
| `SITE_URL`                 | Variable | The app's public address                   |

## 4. Optional parts

Each is off until you set it up:

- [Planning Center sign-in](runbooks/planning-center-sign-in.md) and
  [schedule sync](runbooks/scheduling.md)
- [Notification emails](runbooks/notifications.md) and [phone alerts](runbooks/push-alerts.md)
- [A video library on your own server](runbooks/nas-media.md)
- [The Service Dashboard](runbooks/service-dashboard.md)
- [Weekly encrypted backups](runbooks/backups.md)
- [Error reports and usage counts](runbooks/monitoring.md)
