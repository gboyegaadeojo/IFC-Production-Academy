# Backups, the restore test, and the weekly summary

Supabase Free keeps no backups, so the Academy makes its own (SPEC §9 "Backup design"):

- **Weekly** (`.github/workflows/backup.yml`, Sundays 08:00 UTC; weekly since 2026-11-01): the whole database (`pg_dump`
  custom format, version 17 like Supabase) and every stored SOP file, encrypted with `age` on
  the runner, uploaded with SHA-256 checksums to the **IFC Academy Backups** Shared Drive. Old
  copies are deleted: the last 30 are kept (about 7 months).
- **Monthly** (`restore-test.yml`, the 3rd, 10:00 UTC): downloads the newest backup, checks its
  checksums, decrypts it, restores it into a throwaway Postgres 17 container that uses
  Supabase's own image, and compares row counts with the counts taken when it was made.
- **Weekly** (`weekly-summary.yml`, Mondays 14:00 UTC): emails when each job last succeeded and
  commits `status/last-run.json`, which stops GitHub disabling scheduled jobs after 60 quiet days.
  A keep-alive with no success for two days, or a backup with none for eight, counts as an incident
  and alerts the admins.

None of it logs data: only status, timings, sizes, and file counts. Nothing is ever uploaded as a
workflow artifact. Backups and restore tests are **off until the repository variable
`BACKUPS_ENABLED` is `true`**; until then scheduled runs show as skipped.

## One-time setup

### 1. The encryption keys

On a trusted computer, install [age](https://github.com/FiloSottile/age) and make two keys:

```sh
age-keygen -o academy-backup.key        # the real key: keep it offline
age-keygen -o academy-restore-test.key  # only for the monthly restore test
```

- **`academy-backup.key`** decrypts every backup. Store it offline (for example a password
  manager entry or printed in a safe) with the Production Director and the Platform Admin. Never
  put it in Google Drive or GitHub.
- **`academy-restore-test.key`** lets the monthly job prove a backup restores. It lives in GitHub
  secrets, so anyone who can change this repository's workflows could use it to decrypt a backup
  they also downloaded from the Shared Drive. If that trade-off isn't acceptable, leave it out:
  backups still run, and you restore-test by hand each month with the offline key instead.

Each key file prints its public key (`age1…`). Both public keys go into `AGE_RECIPIENTS`.

### 2. The Shared Drive, service account, and keyless sign-in

New Google Cloud organizations block service-account key files
(`iam.disableServiceAccountKeyCreation`), and keyless is safer anyway. The jobs use **Workload
Identity Federation**: GitHub proves to Google that it's this repository's job on `main`, and
Google returns a short-lived Drive token. There's no key to leak.

1. In IFC's Google Workspace, create a **Shared Drive** named "IFC Academy Backups". Limit members
   to the Production Director and the Platform Admin. Its folder ID is the last part of its address.
2. In Google Cloud, in the backup project, enable the **Google Drive API**, **IAM Service Account
   Credentials API**, and **Security Token Service API**.
3. Create a **service account** (`academy-backup`), with no roles and no keys.
4. **IAM & Admin → Workload Identity Federation → Create pool**: name and ID `github`. Add a
   provider:
   - **OpenID Connect (OIDC)**, name and ID `github-actions`
   - Issuer URL `https://token.actions.githubusercontent.com`, audiences: default
   - Attribute mapping: `google.subject` = `assertion.sub`, `attribute.repository` =
     `assertion.repository`, `attribute.ref` = `assertion.ref`
   - Attribute condition, so only this repository's `main` gets in:
     `assertion.repository == "gboyegaadeojo/IFC-Production-Academy" && assertion.ref == "refs/heads/main"`
5. On the pool, **Grant access → Grant access using service account impersonation**: choose
   `academy-backup`, attribute `repository`, value `gboyegaadeojo/IFC-Production-Academy`. Skip
   the configuration file download.
6. Add the service account's email to the Shared Drive as a **Content manager** (no notification).
7. Note the provider's resource name,
   `projects/<project number>/locations/global/workloadIdentityPools/github/providers/github-actions`.

### 3. The database connection string

In Supabase → Connect → **Session pooler** (IPv4), copy the connection string and put in the
database password. Use the session pooler: GitHub's runners can't reach Supabase's direct
(IPv6) address. The same secret lets every deploy apply new database migrations before the app
goes live; without it, deploys warn that migrations weren't applied.

### 4. Secrets and the variable

```sh
gh secret set SUPABASE_DB_URL               # the connection string from step 3
gh secret set SUPABASE_SERVICE_ROLE_KEY     # Supabase → Project Settings → API keys
gh secret set AGE_RECIPIENTS                # both public keys, separated by a space
gh secret set AGE_RESTORE_IDENTITY < academy-restore-test.key   # optional, see step 1
gh secret set GDRIVE_FOLDER_ID
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "projects/<number>/locations/global/workloadIdentityPools/github/providers/github-actions"
gh variable set GCP_SERVICE_ACCOUNT --body "academy-backup@<project>.iam.gserviceaccount.com"
gh variable set BACKUPS_ENABLED --body true
```

The two `GCP_` values are identifiers, not secrets: without this repository's `main` branch they
open nothing. (Where key files are allowed, a `GDRIVE_SERVICE_ACCOUNT_JSON` secret still works
instead.)

`SUPABASE_URL`, `RESEND_API_KEY`, `ALERT_EMAILS`, and `ALERT_FROM` are shared with the other jobs.
Then delete `academy-restore-test.key` from the computer.

### 5. Check it

Run **Backup** by hand (Actions → Backup → Run workflow). The log should show sizes and
"Retention: … kept, 0 deleted", and three files should appear in the Shared Drive. Then run
**Restore test** by hand and look for "Restore test: pass".

## Restoring for real

Target: back online within 4 hours, losing at most a week of data.

1. Download the newest `academy-db-….dump.age`, `academy-files-….zip.age`, and
   `academy-….sha256` from the Shared Drive, and check them: `sha256sum -c academy-….sha256`.
2. Decrypt with the offline key:
   `age -d -i academy-backup.key -o db.dump academy-db-….dump.age` (and the same for the files).
3. Create a fresh Supabase project (or reset the existing one), then restore:
   `pg_restore --no-owner --no-privileges -d "<session pooler connection string>" db.dump`.
   Supabase's own schemas already exist, so "already exists" messages are expected.
4. Re-upload the files: unzip `files.zip`; each top-level folder is a Storage bucket. Upload them
   to the same paths (for example with the Supabase CLI `supabase storage cp -r`).
5. Point the app at the project: update `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in GitHub
   and run the deploy. Check you can sign in and that a course and an SOP open.
6. Delete every decrypted copy.
