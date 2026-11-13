# Video and graphics approvals (2026-11-12)

**Decided by:** G, after walking through a clickable mock
([artifact](https://claude.ai/artifact/1JwEZvSKwGzn5BZQkeePyd), private to G).
**Replaces:** the church's JotForm "Video / Graphics Approval Form".
**Requirements:** ADD-COPY-01 to ADD-COPY-10 in [SPEC.md](../SPEC.md).

## What it is

Everything shown during a livestream is checked for copyright first. People ask through one public
link, with no account. Quality control looks at every request first and can settle it alone. Only
when copyright needs a closer look do they send it to one or more copyright reviewers. Once it's
approved, everyone scheduled on that service sees it, placed in the order of service.

## G's decisions

1. **Quality control is always first.** It can approve or decline on its own, or send a request
   for a copyright review, choosing the reviewers and writing what to check.
2. **Quality control doesn't need the Academy.** It's a list of names and email addresses in
   Admin → Copyright. Each new request reaches them by email with a private link to their open
   requests. The first person to act takes the request. Removing someone turns their links off.
3. **Copyright reviewers can be either kind.** Academy members (most are on the media team) get a
   **Copyright reviewer** permission, which adds **Copyright** to their side bar, listing the
   requests sent to them. People outside the Academy are a name-and-email list and review from a
   private link that opens only that one request, and stops working once it's decided or after 14
   days. (G, 2026-11-12, after first choosing email-only.)
4. **The reviewer's decision goes straight to the requester**, with Quality control copied.
5. **No separate Media page.** Everyone scheduled on that service in Planning Center, in any
   position, sees a "Cleared to show" card when they sign in, on their home page and that day's
   checklist, so whoever covers Computer Graphics sees it too. On the day, each item sits at its
   place in the order of service with a shared "Loaded" tick. The wall TV showing the same list
   is a follow-up, so its one-screen layout can be fitted carefully.
6. **The media inbox still gets an email** for each approval. Its subject always starts
   "Approved media:", so a Gmail label keeps working.
7. **Quality control places each item** in the Planning Center order of service when it approves or
   sends it for review. Anything not placed shows at the top as "Not placed yet".
8. **Defaults chosen by G's approval of the mock:** a deadline of 5 calendar days (editable, and
   calendar or business days); late requests accepted and marked Late (blocking is a setting);
   the service picked from upcoming Planning Center services, with "Another date"; graphics
   uploaded or linked, videos always a link; the requester checks progress from a private link.

## Things to know

- **People decide here, on purpose.** "The system decides results" is about training. A copyright
  call needs a person.
- **Six editable emails:** We got it, New request, Copyright review needed, Approved, Not approved,
  and Cleared to show. Each has a subject and message with fill-ins, a preview, and Send me a test.
- **Private links, not accounts.** Links carry a random secret; only its SHA-256 is stored. A link
  in a queued email is cleared from the database once the email is sent.
- **Behind a switch.** Admin → Features, "Video and graphics approvals", off until G turns it on.
  While it's off, the form says requests are paused and nothing is emailed.
- **Only admins see every request** in the Academy (`copyright.manage`). Reviewers in the Academy
  see only what's sent to them (`copyright.review`).
