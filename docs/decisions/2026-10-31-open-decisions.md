# Open decisions, settled (2026-10-31)

This settles open decisions 3 to 10 in [SPEC §9](../SPEC.md#open-decisions). G asked for the best
options after research. Anything that needs church leadership's sign-off is marked **Leadership
sign-off**: the decision stands as the working default until they confirm or change it.

## Summary

| # | Decision | In one line |
| --- | --- | --- |
| 3 | Ownership, budget, launch | G owns it; $0 a month; Camera pilot 10 Jan to 7 Feb 2027; ministry-wide launch Sunday 21 Feb 2027 |
| 4 | Brand and theme | "IFC Production Academy" with the IFC pillars-and-dove mark; dark only at launch; academy.ifcwpg.com before launch |
| 5 | Camera competencies and rubrics | Four competencies, three serving roles; observed checklists with critical items ([curriculum](../curriculum/camera-operations.md)) |
| 6 | Content and videos | IFC films its own short lessons on its own cameras; written lessons stand in until each video exists |
| 7 | Privacy, retention, under-18 | Follow PIPEDA's principles; keep training records 7 years after someone leaves; volunteers 14 to 17 with guardian consent |
| 8 | Reminders and certificate | Serving reminder 2 days before at 10:00, learning nudges at 7 and 21 days, quiet hours 20:00 to 08:00; a print-ready certificate with a QR verification check |
| 9 | Calendar and Planning Center | Calendar files stay (built); Planning Center remains the church database; one-way readiness sync in Phase 5 |
| 10 | Native apps | Not until the PWA hits clear limits (criteria below) |

## 3. Ownership, budget, and launch date

**Owner.** G, the Production Director, owns the product and its priorities, and is a Platform
Admin. The two Platform Admin accounts are both G's, so if G is unavailable nobody can recover the
system. **Add a second person** as Platform Admin (a church staff member, for example the
executive pastor or office administrator). They also hold the second offline copy of the backup
decryption key (SPEC §9 "Backup design").

**Maintenance.** G and Claude Code build and maintain it. Routine running is automatic: keep-alive,
notifications, backups (once on), and the weekly summary email. A human spends about 15 minutes a
week reading the weekly summary, and an hour a month on dependency updates and the restore-test
result.

**Budget.** $0 a month to run (SPEC §9). One-time and optional:

| Item | Cost | When |
| --- | --- | --- |
| Custom address academy.ifcwpg.com | $0 (the church already owns the domain) | Before ministry-wide launch |
| Supabase Pro | US$25 a month | Only if the database nears 500 MB, files near 1 GB, or pausing becomes a problem |
| Apple developer account | US$99 a year (nonprofit fee waiver available) | Only if native apps are approved (decision 10) |

Hold a **contingency of CA$400 a year** in the production budget so an upgrade never waits on
approval.

**Launch dates.** December is Christmas production, so the pilot avoids it:

| When | What |
| --- | --- |
| By Sun 15 Nov 2026 | G and the Camera lead check the [Camera curriculum](../curriculum/camera-operations.md) against IFC's cameras, positions, and director calls |
| 16 to 29 Nov 2026 | Film the 12 Level 1 lessons (one weekday evening and one Saturday morning); enter the course in the Academy |
| Dec 2026 | Trainer calibration: two trainers assess the same operator with the checklist and compare (see decision 5) |
| Sun 10 Jan to Sun 7 Feb 2027 | **Camera Level 1 pilot** with 4 to 6 volunteers: two new, two experienced, and one aged 14 to 17 if any serve |
| Sun 14 Feb 2027 | Go or no-go review against SPEC §9's exit criteria |
| **Sun 21 Feb 2027** | **Ministry-wide launch**: Camera Level 1 open to everyone |
| By Sun 2 May 2027 (after Easter, 28 Mar) | Level 1 published for Audio, Graphics and ProPresenter, and Camera Directing |

## 4. Brand and theme

- **Name and lockup:** "IFC Production Academy". The IFC mark (the pillars and the dove) sits beside
  a "Production Academy" wordmark in the app header, the sign-in page, emails, and certificates.
  It is an IFC ministry tool, not a separate brand.
- **Logo files:** use the white mark on dark surfaces and the black mark on printed certificates.
  The website only has PNGs. **Ask IFC's communications team for an SVG** (vector) version; until it
  arrives, the 1183-pixel PNG from ifcwpg.com is used.
- **Colour:** IFC's website is monochrome, with no brand colour to match. The Academy keeps its
  dark "backstage cinema" theme and the single purple action colour (DESIGN-REQUIREMENTS §4), which
  sits well beside a black-and-white mark.
- **Type:** the app keeps IBM Plex Sans (built for interfaces, with tabular numbers). Certificates
  use **Literata**, the serif on ifcwpg.com, for the recipient's name, which ties them visually to
  the church's own materials.
- **Theme:** dark only at launch. A light theme waits for Phase 5 (unchanged). Printed
  certificates use a light layout, so they don't waste ink.
- **Photography:** one 2-hour shoot during a Sunday rehearsal. The shot list: one hero image of the
  production team at work, for the sign-in page, and one cover per department (an operator at each
  position: camera, front of house, ProPresenter, director's desk, lighting console). The light is
  real stage light with deep shadows, and faces are in focus. **Only adults** who have signed IFC's
  photo release appear.
- **Address:** academy.ifcwpg.com. The domain's DNS is at Squarespace, and a Cloudflare Worker can
  only answer on a custom domain whose DNS Cloudflare runs. **Whoever manages ifcwpg.com moves its
  nameservers to Cloudflare's free plan** before 21 Feb 2027, first copying every record (Google
  Workspace mail, Resend's sending records, and the website). The pilot uses the current
  workers.dev address.

## 5. Camera competencies and rubrics

The full curriculum, quiz bank, and practical checklists are in
[docs/curriculum/camera-operations.md](../curriculum/camera-operations.md). The structure:

| Competency | Granted by | Lets you serve as |
| --- | --- | --- |
| Camera Fundamentals | Level 1 practical | **Wide Camera Operator** (locked-off or slow wide shot) on your own; any other camera position as supervised practice |
| Live Shot Operation | Level 2 practical | **Live Camera Operator** (tripod follow camera); needs Camera Fundamentals too |
| Handheld and Gimbal | Level 3 practical | **Roaming Camera Operator**; needs Live Shot Operation too |
| Camera Lead and Trainer | Level 3 practical | Records practical assessments for others (granted the Trainer role by a leader) |

Why it works this way:

- **Level 1 gives a real, safe serving outcome.** A wide shot is low-risk and on air the whole
  service, so a Level 1 graduate can serve on their own straight away. Faster follow-camera work
  needs Level 2. This matches SPEC §1 (Level 1 is "ready for supervised practice", Level 2 is
  "independent assignments"). The scheduler already lets anyone serve any position as supervised
  practice beside an approved operator.
- **Checklists, not graded scales.** Each item is observable ("Sets focus by zooming in on the
  speaker's eyes, focusing, then zooming back out"), ticked Observed or Not observed. Checklists
  are more consistent between assessors than graded scales, and the Academy's system-decided pass
  rule needs yes-or-no items.
- **Critical items.** Some items are marked **required**: missing one means "Further practice
  required", however well the rest went. These are the safety and on-air items, such as not
  moving a camera that's live on tally unless directed, and securing the tripod. Good practice for
  performance assessment is that a strong overall score never makes up for a missed critical
  step.
- **Pass rule:** every required item, and at least 80% of all items. The rule is fixed before
  assessment, never changed during one.
- **Reassessment:** after "Further practice required", wait at least 7 days, so there's at least
  one more service to practise at.
- **Calibration:** before the pilot, two trainers assess the same operator independently and
  compare. Any item they disagree on gets clearer wording.
- **Expiry:** off (the SPEC default). Turn on 24-month expiry only if skills visibly fade.

## 6. Course content and video inventory

- **IFC films its own lessons.** Lessons filmed at IFC's own camera positions, with IFC's own
  people, are what makes this better than a generic course (SPEC §7). Each Level 1 video is 3 to 8
  minutes: one idea, shown on IFC's actual camera. Filming notes for each lesson are in the
  curriculum doc.
- **Upload as Unlisted to the church YouTube channel**, in a playlist named "Production Academy
  (unlisted)". Never upload as Private: private videos can't play in the Academy (SPEC §2). Anything
  sensitive, such as room layouts or the network, goes on the NAS video library instead.
- **Written lessons stand in until each video exists.** Every lesson has written key points, so
  the pilot can start even if a video is late.
- **Audit the existing YouTube library** in November: check the channel's unlisted and older uploads
  for usable training footage, such as service recordings that show good and poor framing for
  lesson 4.
- **Captions:** turn on YouTube's automatic captions and correct them, which takes about 10 minutes
  per video (SPEC §6, accessibility).

## 7. Privacy, retention, and under-18 volunteers

**Leadership sign-off** on all of this.

**Which law applies.** PIPEDA, Canada's federal private-sector privacy law, covers personal
information collected in the course of *commercial activity*. A church training its own volunteers
is very likely outside it. Manitoba passed its own private-sector law (PIPITPA) in 2013, but it has
never been proclaimed in force. **Decision: follow PIPEDA's ten fair information principles
anyway.** It's the right standard for a church, it costs nothing extra, and it keeps the Academy
ready if Manitoba's law starts.

- **Privacy officer:** the Production Director (G), named in the privacy notice.
- **Privacy notice:** a plain-language page in the Academy, linked from sign-in and the profile
  page. It says what is collected and why, who can see what, how long records are kept, and how to
  ask for a copy, a correction, or deletion.
- **Collect only what's needed:** name, email, departments, training records, and (for minors)
  birth month and year and a guardian's name and email. No phone numbers, addresses, or photos.

**Retention schedule.** Manitoba's Limitations Act gives a 2-year basic limitation period from
discovery and a 15-year ultimate limit. Training records aren't safeguarding records, so they don't
need the decades-long retention that child-safety files do.

| Record | Kept for | Then |
| --- | --- | --- |
| Training, competency, assessment, certificate, and serving-approval records | While active, then **7 years** after the account is deactivated | Anonymised: the person's name and email are removed; the records stay for counts |
| Audit events | **7 years** | Deleted |
| Mentoring private notes | **2 years** after the mentoring pairing ends | Deleted |
| Shared mentoring feedback and goals | Same as training records | Anonymised |
| Schedules and availability | **2 years** after the event | Deleted |
| In-app notifications and email send records | **12 months** | Deleted |
| Guardian consent records | Until the volunteer turns 18, plus **7 years** | Deleted |
| Backups | 30 daily, 12 weekly, 12 monthly (SPEC §9) | Rotated out automatically |

The clean-up job (`retention.yml`) has to be built before the first record reaches its limit. The
earliest is notifications, on 31 Oct 2027.

- **Deletion requests:** a volunteer can ask the privacy officer to delete their account. The
  Academy anonymises it straight away instead of waiting 7 years, except audit events, which keep
  the record that the deletion happened.
- **Exports:** CSV exports never include mentoring notes (already built) or a minor's birth date or
  guardian details.

**Under-18 volunteers.** Canadian law sets no minimum age for volunteering. Each organisation sets
its own policy, and guardian consent for anyone under 18 is the norm. Many church tech teams rely
on teenagers.

- **Minimum age: 14.** Under 14 can't hold an account. Ages 14 to 17 can join with **recorded
  guardian consent**.
- **At sign-up**, everyone confirms "I'm 18 or older" or gives their birth month and year. A
  volunteer under 18 can sign in and see departments, but **can't request membership until a
  leader records guardian consent**: the guardian's name and email, how consent was given (paper
  form or email), and the date. The leader's action is audited.
- **Hidden from other volunteers:** a minor's name appears only to leaders, trainers, and their
  mentor, never on lists other volunteers can see (SPEC §6).
- **Serving:** a minor may serve, but is never named as anyone's supervisor, and can't hold
  Trainer or Leader roles.
- **Mentoring:** a minor's mentor must be an adult who has passed IFC's child-safety screening.
  Mentoring in the Academy is notes and goals, not private messaging, so nothing in the app creates
  a one-to-one private channel.
- **Photos:** minors never appear in Academy photography or lesson videos without separate written
  guardian consent under IFC's photo policy.
- **Turning 18:** the minor flag clears automatically after their birth month. Guardian consent is
  then kept for the 7 years above.
- **Defer to IFC's child-safety policy** wherever it is stricter.

**Email law (CASL).** Canada's anti-spam law covers *commercial* electronic messages. The Academy's
emails, such as sign-in links, assignments, and reminders, are about an existing volunteer
relationship and promote nothing, so they aren't commercial messages. Every email still names the
sender and links to notification settings (built), which meets CASL's identification and
unsubscribe rules anyway.

## 8. Reminder schedule and certificate template

**Reminders.** Reminders work best when they are specific and personal, and when there are few of
them. Every reminder can be turned off per person in Notification settings (built).

| Reminder | When | To |
| --- | --- | --- |
| You've been scheduled | Straight away (built) | Volunteer |
| Please confirm | 48 hours after being scheduled, if still unconfirmed and the event is more than a day away | Volunteer |
| Serving soon | **2 days before at 10:00**, with the SOPs for their role (ADD-SCHED-01) | Confirmed volunteer, and their supervisor |
| Keep going | **7 days** with no progress on a course they've started; once more at **21 days**; nothing after 60 days. Starts again only if they make progress and then stall | Volunteer, naming the next lesson |
| Assessment requested | Straight away | Everyone who can record practicals for that department |
| Assessment waiting | Request still open after **7 days** | Department leaders |
| SOP review due | 7 days before (built), and once more 7 days after if still not reviewed | SOP owner |
| Competency expiring | 30 days before, only where expiry is turned on | Volunteer and department leaders |

**Quiet hours:** no email is sent between **20:00 and 08:00 Winnipeg time**. Anything queued
overnight goes at 08:00. Sign-in links ignore quiet hours, because Supabase sends them straight
away.

**No double reminders with Planning Center:** the Academy only reminds people about assignments made
in the Academy. A department that schedules in Planning Center has no Academy assignments, so
nobody gets two reminders (decision 9).

**Certificate.**

- **Layout:** landscape, sized for US Letter and A4, with a light background so it prints well.
  The IFC mark sits at the top, then "Production Academy". A thin band in the department's colour
  runs along one edge. The level badge sits beside the date.
- **Wording:** "This certifies that **{name}** has completed **{course}**, {department}, Level {n}"
  appears above the issue date (Winnipeg time) and a signature line reading "Production Director,
  Immanuel Fellowship Church".
- **Honesty line** (SPEC §3): "This certificate records completed training. Approval to serve is
  given separately, through practical assessment."
- **Verification:** the reference number, and a **QR code** linking to a public check page. The
  page shows only whether it's valid or withdrawn, the course, the department and level, the issue
  date, and the recipient's **initials**, never their full name. A forged paper copy then fails
  the check, and nobody's name is exposed to the public.
- **Download:** the in-app certificate prints to PDF with a print layout ("Save as PDF").
- **Later (Phase 5):** issue certificates as Open Badges 3.0, so volunteers can add them to a
  digital wallet. Not worth it at launch.

## 9. Calendar provider and Planning Center

IFC already uses **Planning Center** (Church Center forms on ifcwpg.com).

- **Planning Center stays the church's people database.** The Academy never copies anyone's
  personal details into or out of Planning Center at launch, and makes no claim to replace it
  (SPEC §1 scope).
- **Calendar:** the calendar file download is built (Phase 5). No Google or Microsoft calendar
  connection is needed.
- **Phase 5 sync: one way, readiness only.** A nightly job writes each volunteer's Approved to Serve
  roles into Planning Center Services, for example as team position tags, so whoever schedules in
  Planning Center sees who is approved. It uses a Planning Center personal access token (correct
  for a single church) held as a GitHub Actions secret, and it never reads volunteers' personal
  details back.
- **One scheduler per department.** If a department already schedules in Planning Center Services,
  it keeps doing so. The Academy's scheduler is then used only for training and supervised-practice
  slots, and its "Serving soon" reminder is off for that department.
- **One question for G:** which production teams schedule in Planning Center Services today? The
  answer decides which departments use the Academy scheduler from day one.

## 10. Native apps

There won't be native apps until the installed PWA hits a clear limit. Build iOS and Android
(SPEC §8) only if, after 6 months of ministry-wide use:

- push notifications are needed beyond what iOS home-screen web push gives, or
- 40% or more of weekly active volunteers have installed the PWA and ask for app-store installs, or
- at least 100 people use the Academy each month.

Otherwise the PWA stays, at no cost.

## Sources

- Planning Center: [reminder emails](https://help.planningcenter.com/en/set-up-reminder-emails.html), [scheduling emails](https://help.planningcenter.com/en/send-scheduling-emails.html), [API access tokens (summary)](https://www.usecarly.com/blog/planning-center-api/)
- Privacy: [Should Canadian charities comply with PIPEDA?](https://www.charitylawgroup.ca/charity-law-questions/should-canadian-charities-comply-with-pipeda), [Torkin Manes on charities and privacy law](https://www.torkin.com/insights/publication/charities-and-not-for-profits-obligations-for-compliance-with-privacy-legislation), [Canadian Baptist privacy policy guide](https://baptist.ca/wp-content/uploads/2023/11/Guide-to-Writing-a-Privacy-Policy-0814.pdf), [Manitoba PIPITPA status (CanLII)](https://www.canlii.org/en/mb/laws/stat/ccsm-c-p33.7/latest/ccsm-c-p33.7.html), [Stikeman Elliott on Manitoba's law](https://stikeman.com/en-ca/kh/canadian-technology-ip-law/manitobans-get-new-privacy-law-but-no-one-to-complain-to)
- Limitation periods: [MLT Aikins on Manitoba's Limitations Act](https://www.mltaikins.com/insights/changes-to-limitation-periods-in-manitoba-bill-51/), [Fillmore Riley](https://www.fillmoreriley.com/publication/manitoba's-new-limitations-act-easier-to-understand-and-more-aligned-with-other-provinces-limitation-laws)
- Retention practice: [Anglican Diocese of New Westminster screening guide](https://www.vancouver.anglican.ca/programs/screening-in-faith), [Volunteer Toronto Q&A](https://www.volunteertoronto.ca/page/SectorQA), [United Church sample records schedule](https://unitedchurcharchives.ca/wp-content/uploads/2024/07/SampleRecordsScheduleCongregations_2024.pdf), [Church Law & Tax on screening records](https://www.churchlawandtax.com/keep-safe/abuse-prevention/qa-how-long-should-we-keep-consent-forms-and-screening-records/)
- Minors: [Canadian Legal FAQs on volunteer age](https://www.law-faqs.org/?p=2343), [Summerside Community Church child protection policy](https://www.summersidechurch.ca/wp-content/uploads/2022/09/Child-Protection-Policy-2022.pdf), [ChurchTechToday on photo consent for children](https://churchtechtoday.com/photo-consent-for-kids/)
- CASL: [CRTC guidance for registered charities (Mondaq)](https://mondaq.com/canada/charities-non-profits/332016/crtc-releases-guidance-on-casls-application-to-registered-charities), [Carters bulletin](https://www.carters.ca/pub/bulletin/charity/2014/chylb346.htm)
- Camera training: [Church Production Magazine](https://www.churchproduction.com/education/training-volunteer-camera-operators/), [Churchfront](https://churchfront.com/2024/07/09/camera-operator-and-video-director-training-for-church-live-streaming/), [venue camera operator checklist](https://rivproductions.com/information/camera/holt-venue-camera-operator-checklist/), [camera framing guide](https://www.anona.com/ama-training-resources/2022/1/18/camera-framing)
- Assessment design: [performance checklists and critical steps](https://open-exam-prep.com/study-guides/bcsp-cit/assessment-instruments/performance-checklists-cut-scores), [rubric design guide](https://www.bristolcc.edu/_resources/documents/Rubric_Design_Guide.pdf)
- Reminders: [personalised reminder trial (JMIR Formative Research, 2023)](https://formative.jmir.org/2023/1/e43977)
- Certificates: [Open Badges 3.0 and verifiable credentials](https://archive.dougbelshaw.com/open-thinkering/verifiable-credentials-and-open-badges-3-0-whats-changed/)
- IFC: [ifcwpg.com](https://ifcwpg.com) (logo, fonts, Church Center)
