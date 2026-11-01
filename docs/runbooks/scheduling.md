# Scheduling: Planning Center and the Academy

Planning Center Services schedules production. The Academy reads it every 15 minutes and shows it
to volunteers with their checklists and training (decision record 9). Schedulers and volunteers
keep using Planning Center as they do now.

## 1. Connect Planning Center (once)

The Academy uses the same read-only Personal Access Token as the Sunday Pre-Service Checklist app.
It needs **Services** and **People** (People is used only to read email addresses for matching).

In a terminal, in this repository, run each line and paste the value when asked. Never paste a
secret into a chat, an issue, or a file:

```sh
gh secret set PCO_PAT_ID
gh secret set PCO_PAT_SECRET
```

Then run the job once by hand: **Actions → Planning Center sync → Run workflow**. Its log shows
counts only, such as "plans 9, scheduled 31, people matched 18". If it says Planning Center refused
the token, the token is wrong or doesn't include Services and People.

### Refresh on demand (optional)

**Refresh from Planning Center** on the Planning Center page runs the sync straight away instead
of waiting up to 15 minutes. The Planning Center token stays in Actions secrets: the button asks
GitHub to run the same job. It needs a GitHub token that can do only that:

1. On GitHub: **Settings → Developer settings → Fine-grained personal access tokens → Generate
   new token**. Resource owner: you. Repository access: **Only select repositories**, this one.
   Permissions: **Actions: Read and write**, nothing else. Pick an expiry and note it.
2. Add it to Cloudflare as a secret (paste when asked; never in a chat or file):

   ```sh
   npx wrangler secret put GITHUB_DISPATCH_TOKEN
   ```

Until it's set, the button doesn't show. It can be pressed once every two minutes, and each press
is in the audit log. When the token expires, the button says it couldn't reach GitHub; make a new
one and put it again.

## 2. Link positions

In the Academy, open **Admin → Planning Center**. After the first read it lists each Planning
Center service type, team, and position, like the checklist app's Team mapping.

1. Create matching Academy positions first, in **Competencies and roles** (for example Camera 1,
   Camera 2, Audio, ProPresenter, Production Director, Technical Director, Miscellaneous), each in
   its department.
2. On the Planning Center page, link each Planning Center position to its Academy position. A team
   can also be linked as a whole; positions without their own link follow it.
3. Links apply at the next read, within 15 minutes, or straight away with **Refresh from Planning
   Center**.

**Scheduled in positions not linked yet** lists people on an upcoming service whose Planning
Center position isn't linked, or whose position name matches nothing in Planning Center. They
won't see a checklist until it's linked. Pre-service checklists shows the same warning for the
current service.

**Not in the Academy yet** lists people on a Planning Center team or schedule with no Academy
account using one of their Planning Center emails. Invite them with that email.

## 3. Set what each position sees on the day

In **Serving teams**, each position shows who is on it (from Planning Center's roster) and two
switches, as in the checklist app:

- **Sees all departments:** whoever is scheduled here sees every checklist by default
  (Technical Director).
- **Gets the Director role while scheduled:** can reset and undo the service's checklists
  (Technical Director, and Production Director if you like).

## 4. Bring in the checklists

In **Pre-service checklists**, add one checklist per kind of position (Camera Operators, Audio
Engineer, Presentation / Computer Graphics, Director (Switcher), Technical Director,
Miscellaneous), each in its department, and link it to the positions that use it. Use **Paste a
list** to bring in the current checklist without retyping it: ready-to-paste text for all six
lists is in the `private/checklists/` folder on G's computer, kept out of the public repository.

Then, under **Pre-service checklists → Settings**, choose the Planning Center **service type** the
checklist follows (such as the Sunday service), so a youth night or rehearsal earlier in the week
doesn't open first, and the usual **service day** (Sunday). When nothing is published yet, the
checklist still opens for that day with a note saying so; once Planning Center publishes the
service, the next sync gives it that day's checklist, ticks included.

## What volunteers see

- **Your schedule:** where they're serving (from Planning Center), a month calendar, who's serving
  with them, and their blockout dates. Accept, decline, and block out dates in Planning Center;
  changes show within 15 minutes.
- **Checklist:** today's service, or the next (or the next service day, if nothing is published
  yet). Scheduled volunteers see their position's
  checklist first; production team members who aren't serving can still help.

## If IFC ever schedules in the Academy

The Academy's own scheduler (service types, the Matrix, sign-ups, and swaps) is built but switched
off. An organisation-wide scheduler can switch it on under **Who schedules** on the Planning Center
page. While Planning Center schedules, the Academy refuses schedule changes from anyone but the
sync, so the two can't drift apart.
