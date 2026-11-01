# Open decisions, settled (2026-10-31)

This settles open decisions 3 to 10 in [SPEC §9](../SPEC.md#open-decisions). G asked for the best
options after research, and later answers from G are recorded in place with the date.

## Summary

| # | Decision | In one line |
| --- | --- | --- |
| 3 | Ownership, budget, launch | G owns it; $0 a month; Camera pilot 10 Jan to 7 Feb 2027; ministry-wide launch Sunday 21 Feb 2027 |
| 4 | Brand and theme | "IFC Production Academy" with the IFC pillars-and-dove mark; dark only at launch; stays on its workers.dev address |
| 5 | Camera competencies and rubrics | Four competencies, three serving roles; observed checklists; training is shown to schedulers, never a gate to serving ([curriculum](../curriculum/camera-operations.md)) |
| 6 | Content and videos | IFC films its own short lessons on its own cameras; written lessons stand in until each video exists |
| 7 | Privacy, retention, under-18 | Not needed: no privacy notice, retention schedule, or age rules in the Academy |
| 8 | Reminders and certificate | Serving reminder 2 days before at 10:00, learning nudges at 7 and 21 days, quiet hours 20:00 to 08:00; a print-ready certificate with a QR verification check |
| 9 | Calendar and Planning Center | Planning Center Services schedules; the Academy reads it every 15 minutes. The Academy's own scheduler is built but switched off, for later |
| 10 | Native apps | Not until the PWA hits clear limits (criteria below) |

## 3. Ownership, budget, and launch date

**Owner.** G, the Production Director, owns the product and its priorities, and is a Platform
Admin. The two Platform Admin accounts are both G's, so if G is unavailable nobody can recover the
system. **Add a second person** as Platform Admin (a church staff member, for example the
executive pastor or office administrator). They also hold the second offline copy of the backup
decryption key (SPEC §9 "Backup design"). G will choose this person later; it isn't needed for the
pilot.

**Maintenance.** G and Claude Code build and maintain it. Routine running is automatic: keep-alive,
notifications, backups (once on), and the weekly summary email. A human spends about 15 minutes a
week reading the weekly summary, and an hour a month on dependency updates and the restore-test
result.

**Budget.** $0 a month to run (SPEC §9). One-time and optional:

| Item | Cost | When |
| --- | --- | --- |
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
| Sun 10 Jan to Sun 7 Feb 2027 | **Camera Level 1 pilot** with 4 to 6 volunteers: at least two new and two experienced |
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
- **Theme:** dark is the default. *Revised 2026-11-01:* G asked for the checklist app's Appearance
  setting now, so each person can choose **Dark, Light or System** in the menu under their name or
  on the sign-in page, remembered on that device. Printed certificates use a light layout in every
  theme, so they don't waste ink.
- **Photography:** one 2-hour shoot during a Sunday rehearsal. The shot list: one hero image of the
  production team at work, for the sign-in page, and one cover per department (an operator at each
  position: camera, front of house, ProPresenter, director's desk, lighting console). The light is
  real stage light with deep shadows, and faces are in focus. **Only adults** who have signed IFC's
  photo release appear.
- **Address:** the Academy stays on its workers.dev address (G, 2026-10-31). A church address such
  as academy.ifcwpg.com would mean moving ifcwpg.com's DNS from Squarespace to Cloudflare, because
  a Cloudflare Worker only answers on a custom domain whose DNS Cloudflare runs, and G doesn't want
  to move it. Volunteers reach the Academy from a link on the church website or the installed app,
  so the address rarely shows. If the Worker's name changes, update the `SITE_URL` repository
  variable and Supabase Auth's redirect URLs at the same time.

## 5. Camera competencies and rubrics

The full curriculum, quiz bank, and practical checklists are in
[docs/curriculum/camera-operations.md](../curriculum/camera-operations.md). The structure:

| Competency | Granted by | Lets you serve as |
| --- | --- | --- |
| Camera Fundamentals | Level 1 practical | **Wide Camera Operator** (locked-off or slow wide shot) |
| Live Shot Operation | Level 2 practical | **Live Camera Operator** (tripod follow camera); needs Camera Fundamentals too |
| Handheld and Gimbal | Level 3 practical | **Roaming Camera Operator**; needs Live Shot Operation too |
| Camera Lead and Trainer | Level 3 practical | Records practical assessments for others (granted the Trainer role by a leader) |

**Training is shown, never a gate; position teams decide who serves** (G, 2026-10-31). People
learn at different paces, so not passing never stops anyone. Who can be scheduled works the way
IFC already runs Planning Center Services:

- **Position teams.** Each position (serving role, such as Camera 1, Camera 2, Audio,
  ProPresenter) has a team. A position can only be filled from its team. Whoever runs the teams
  (the Scheduling Administrator, a department leader, or the Production Director) adds people when
  they're ready, in Serving teams. Someone not yet in the department joins it when added.
- **One position a day.** Nobody is scheduled on a day they've blocked out, or in a second
  position the same day anywhere in the production team, unless someone with override rights gives
  a reason.
- **Training shows beside each name** ("Trained" or "Still learning") on the team page and when
  scheduling, and the scheduler can pair a learner with a trained person ("Someone alongside").
- **"Not yet", not "fail".** A practical that doesn't meet the pass rule reads "Not yet, keep
  practising", with the trainer's feedback, and there's no waiting period.
- **Approved to Serve still means something.** It stays its own record (SPEC §3), shown on the
  person's department page, the readiness reports, and the team page. It informs who gets added
  to a team; it doesn't add them. This sets aside SRS-COMP-006's automatic block.

How the checklists work:

- **Checklists, not graded scales.** Each item is observable ("Sets focus by zooming in on the
  speaker's eyes, focusing, then zooming back out"), ticked Observed or Not observed. Checklists
  are more consistent between assessors than graded scales, and the Academy's system-decided pass
  rule needs yes-or-no items.
- **Required items.** Some items are marked **required**, such as not moving a camera that's live
  on tally unless directed, and securing the tripod. Missing one means "Not yet", however well the
  rest went, because those are the on-air and safety basics.
- **Pass rule:** every required item, and at least 80% of all items. The rule is fixed before
  assessment, never changed during one.
- **Calibration:** before the pilot, two trainers assess the same operator independently and
  compare. Any item they disagree on gets clearer wording.
- **Expiry:** off (the SPEC default).

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

**Not needed** (G, 2026-10-31). The Academy has no privacy notice page, no retention schedule or
clean-up job, and no age rules. Training and serving records are kept. The draft privacy
notice was withdrawn. What the app already does stays: it collects only names, emails,
departments, and training and serving records; private mentoring notes are seen only by their
author and never exported; and an administrator can deactivate an account on request.

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

**No double reminders:** production stops scheduling in Planning Center (decision 9), so the
Academy's reminders are the only ones volunteers get.

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

**Planning Center Services schedules; the Academy reads it** (G, 2026-10-31, revised the same
day). G asked why the Academy didn't use Planning Center's existing scheduling. Planning Center
can't be embedded in another site, but its API can be read, as IFC's Sunday Pre-Service Checklist
app already does. So schedulers and volunteers keep using Planning Center, and the Academy shows
what it reads from there:

- **A scheduled job** (`planning-center.yml`, every 15 minutes) reads Planning Center with the
  same read-only Personal Access Token as the checklist app: service types, teams and positions,
  each position's roster, plans for the next 60 days with who's scheduled and their replies, and
  blockout dates. It writes them into the Academy with the service role. It logs counts only.
- **People are matched by email:** their Academy sign-in email is one of their Planning Center
  emails. Only the match is kept, not the emails.
- **Position links**, on the Planning Center admin page like the checklist app's Team mapping, tie
  each Planning Center position (or a whole team) to an Academy position, so its people get the
  right checklist, training, and switches.
- **Volunteers** accept, decline, and block out dates in Planning Center; the Academy's schedule,
  calendar, "who's serving with you", and the service-day checklist all follow it. Planning Center
  sends its own reminders, so the Academy doesn't.
- **The Academy's own scheduler** (service types, the Matrix, sign-ups, swaps, below) is built but
  switched off. A scheduler can turn it on from the Planning Center page if IFC ever schedules in
  the Academy instead. While Planning Center schedules, the database refuses schedule changes
  from anyone but the sync.

What the Academy's own scheduler offers, for later:

Why this works better than keeping two systems: training and scheduling sit in one place, so a
scheduler sees who is trained as they schedule, and volunteers have one app for learning and
serving.

How Planning Center is set up today, and how the Academy matches it: one production team with
positions (Audio, Camera 1, Camera 2, Miscellaneous, Production Director, ProPresenter, Technical
Director); people added to each position they serve in; service types (the Sunday service,
Communion, Crossover) with a dated plan for each service; volunteers who accept or decline, block
out dates, and sign up for open spots. In the Academy, positions are serving roles in each
department, and position teams are in Serving teams (built).

What the Academy adds so schedulers and volunteers don't miss Planning Center (built in stages):

1. **Calendars** (built). A month calendar for volunteers: tap a day to see where you're serving
   and who with. A calendar of every service for schedulers.
2. **Service types** (built). Set up "Sunday service, 10:05, with these positions" once and make
   the next weeks' services in one step.
3. **The Matrix** (built). The next services side by side, one row per position, with who is in
   each. Suggested people for a position: free first, then trained, then whoever served least
   recently. Never someone away or already serving that day.
4. **Swaps and sign-ups** (built). A volunteer who can't make it asks for cover; teammates on that
   position who are free that day are asked, and the first to take it is scheduled in their
   place. When a scheduler opens sign-ups (on a service, or on a service type for the services
   made from it), team members can take open spots themselves.
5. **Pre-service checklists** (built). Each volunteer sees the checklist for the position they're
   serving in, ticks as they go, and sees the team's progress. Positions that lead the service
   (such as Technical Director) can reset and undo. Leaders edit checklists, or paste one in.
6. **Already built:** confirm or decline, days away, reminders (serving soon, please confirm),
   calendar file download, and the service-day view with SOPs.

**Switch-over:** none needed while Planning Center schedules. If IFC later moves scheduling into
the Academy, run both for a month first.

**Calendar:** the calendar file download stays; no Google or Microsoft calendar connection is
needed.

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
