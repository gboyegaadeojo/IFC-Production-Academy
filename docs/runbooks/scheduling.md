# Scheduling in the Academy: setting it up

How to move production scheduling from Planning Center Services into the Academy (decision record
9). Planning Center stays the church's people database; only production's scheduling moves. Plan to
run both during the pilot month (January), then schedule only in the Academy from the ministry-wide
launch (Sunday 21 February 2027).

Everything below is done in the Academy's admin area. Nothing needs a developer.

## 1. Give your scheduler the role

In **People and roles**, give the person who sets up teams and builds the schedule the
**Scheduling Administrator** role. It covers every department: serving teams, the schedule,
overrides (with a reason), and pre-service checklists. Department leaders and the Production
Director can do the same for their own areas.

The person needs an Academy account first: invite them from **Invitations**, or ask them to sign
in once with their email.

## 2. Create the positions

Positions are the "serving roles" in each department, set up in **Competencies and roles**. Match
Planning Center's positions, for example:

| Planning Center position | Department in the Academy |
| --- | --- |
| Camera 1, Camera 2 | Camera Operations |
| Audio | Audio Engineering |
| ProPresenter | Computer Graphics and ProPresenter |
| Production Director, Technical Director | Camera Directing |
| Miscellaneous | Whichever department those helpers belong to |

A position can need competencies (so the Academy can show "Trained"), but it doesn't have to.
Training never stops anyone being scheduled.

## 3. Add people to each position's team

In **Serving teams**, choose a department, then add people to each position they serve in, just
as they're set up in Planning Center. Someone not yet in the department joins it when added.
Schedulers can only fill a position from its team.

While you're there, mark **Production Director** and **Technical Director** as **leading
positions**. Whoever is scheduled in one can reset that service's checklists.

## 4. Set up the services

In **Schedule → Service types**, add each kind of service once, with its usual start time, length,
and the positions it needs, in order. For example:

- 479 Sunday Service, 10:05, 105 minutes
- Communion Service, 10:05
- Crossover Service, 8:00 a.m.

Then use **Make services** to create the next weeks (for example, 8 Sundays). Dates that already
have that service are skipped, so it's safe to run again.

Turn on **Open sign-ups** for a service type if team members may take open spots themselves.

## 5. Schedule

- **Matrix:** the next services side by side, one row per position. Open a cell to schedule
  someone. Suggested people come first: free that day, trained, and whoever served least
  recently.
- The Academy won't schedule anyone who blocked out that day, or who is already serving in
  another position that day, unless someone with override rights gives a reason.
- Volunteers confirm or decline in **Your schedule**, see a month calendar and who they're
  serving with, block out days, ask a teammate to cover, and sign up for open spots.

## 6. Bring in the pre-service checklists

In **Pre-service checklists**, add one checklist per kind of position (Camera Operators, Audio
Engineer, Presentation / Computer Graphics, Director (Switcher), Technical Director,
Miscellaneous), each in its department. Link it to the positions that use it (Camera Operators to
Camera 1 and Camera 2).

To bring in the current Sunday Pre-Service Checklist without retyping it, open each one and use
**Paste a list**. Ready-to-paste text for all six lists, 114 tasks in all, is in the `private/checklists/`
folder on G's computer. It's kept out of the public repository because it includes an internal email
address.

On the day, everyone scheduled opens **Checklist** from their schedule: their own list first, the
team's progress, and the other lists if they're helping elsewhere.
