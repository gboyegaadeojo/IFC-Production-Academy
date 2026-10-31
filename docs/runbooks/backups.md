# Backups, the restore test, and the weekly summary

Supabase Free keeps no backups, so the Academy makes its own (SPEC §9 "Backup design"):

- **Nightly** (`.github/workflows/backup.yml`, 08:00 UTC): the whole database (`pg_dump`
  custom format, version 17 like Supabase) and every stored SOP file, encrypted with `age` on
  the runner, uploaded with SHA-256 checksums to the **IFC Academy Backups** Shared Drive. Old
  copies are deleted: 30 daily, 12 Sundays, 12 first-of-the-month.
- **Monthly** (`restore-test.yml`, the 3rd, 10:00 UTC): downloads the newest backup, checks its
  checksums, decrypts it, restores it into a throwaway Postgres 17 container that uses
  Supabase's own image, and compares row counts with the counts taken when it was made.
- **Weekly** (`weekly-summary.yml`, Mondays 14:00 UTC): emails when each job last succeeded and
  commits `status/last-run.json`, which stops GitHub disabling scheduled jobs after 60 quiet days.
  A keep-alive or backup with no success for two days counts as an incident and alerts the admins.

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

### 2. The Shared Drive and service account

1. In IFC's Google Workspace, create a **Shared Drive** named "IFC Academy Backups". Limit members
   to the Production Director and the Platform Admin.
2. In Google Cloud, create a project, enable the **Google Drive API**, create a **service
   account**, and create a JSON key for it.
3. Add the service account's email to the Shared Drive as a **Content manager**.
4. Open the Shared Drive in a browser. The folder ID is the last part of the address.

### 3. The database connection string

In Supabase → Connect → **Session pooler** (IPv4), copy the connection string and put in the
database password. Use the session pooler: GitHub's runners can't reach Supabase's direct
(IPv6) address.

### 4. Secrets and the variable

```sh
gh secret set SUPABASE_DB_URL               # the connection string from step 3
gh secret set SUPABASE_SERVICE_ROLE_KEY     # Supabase → Project Settings → API keys
gh secret set AGE_RECIPIENTS                # both public keys, separated by a space
gh secret set AGE_RESTORE_IDENTITY < academy-restore-test.key   # optional, see step 1
gh secret set GDRIVE_SERVICE_ACCOUNT_JSON < service-account.json
gh secret set GDRIVE_FOLDER_ID
gh variable set BACKUPS_ENABLED --body true
```

`SUPABASE_URL`, `RESEND_API_KEY`, `ALERT_EMAILS`, and `ALERT_FROM` are shared with the other jobs.
Then delete `service-account.json` and `academy-restore-test.key` from the computer.

### 5. Check it

Run **Backup** by hand (Actions → Backup → Run workflow). The log should show sizes and
"Retention: … kept, 0 deleted", and three files should appear in the Shared Drive. Then run
**Restore test** by hand and look for "Restore test: pass".

## Restoring for real

Target: back online within 4 hours, losing at most a day of data.

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
