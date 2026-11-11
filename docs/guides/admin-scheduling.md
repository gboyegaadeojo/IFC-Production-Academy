# Admin: scheduling

Planning Center Services schedules, and the Academy reads from it. The Academy never changes anything in Planning Center.

## Planning Center

The **Planning Center** page is where the two connect.

- **The top of the page:** the key numbers from the last read, which happens every 15 minutes. Choose **Refresh now** if you've just made a change and don't want to wait. If no read has worked for an hour, an orange warning says since when, with **Try again now**. It goes away by itself once a read works.
- **Position links:** connect each Planning Center position to an Academy position, so people see the right checklist and their training. Your choice saves as soon as you pick it. On a phone, tap a row to choose. Planning Center gives each service type its own copy of a team, so link each one. Add Academy positions under [Competencies and roles](admin-assessments.md) first.
- **Scheduled in positions not linked yet:** these people won't see their checklist for the service until you link their position.
- **Not in the Academy yet:** people on a Planning Center team or schedule who haven't signed in. Nothing is sent to them. They get an account the first time they sign in with Planning Center. While the Academy schedules, anyone in the church's Planning Center can sign in this way, and you add them to teams here.
- **Who schedules:** Planning Center, or the Academy's own tools. Leave it on Planning Center unless you've decided to move away from it. While the Academy schedules, Planning Center Services isn't read at all, so nothing there changes the schedule here.

### Switching who schedules

Open **Change this** under Who schedules. Before you switch to the Academy, it shows what will be copied from Planning Center: service types, upcoming services, who's scheduled with their replies, team members, and blockout dates. Choose **Switch to the Academy** and they become the Academy's own, so nothing needs to be typed in again. Past services aren't touched, and nobody is emailed.

Switching back to Planning Center hands those upcoming services back, and the next read updates them from Planning Center. Services you made in the Academy stay. Anything you changed in the Academy meanwhile isn't sent to Planning Center, so make it there too. Each switch is in the audit log.

The setup is in the [Planning Center setup guide](../runbooks/scheduling.md).

## Serving teams

**Serving teams** shows who serves in each position, with their training, and a column for each Start here course (Done or Not yet), and what each position sees on the day. These are there to help you, and they never stop anyone being added. While Planning Center schedules, you add people to positions there, and they appear here after the next read.

Each position has settings for the day:

- **Sees all departments:** opens every department's checklist first.
- **Leads the service:** can reset the checklists.
- **Gets the Director role while scheduled.**

## Schedule

**Schedule** has two views while Planning Center schedules:

- **Coming up:** each service, and how many positions are filled.
- **Calendar:** every service this month. Tap a day to see who's serving and what's still open.

To change a service or who's on it, do it in Planning Center. It shows here within 15 minutes.

## If the Academy schedules instead

If **Who schedules** is set to the Academy, you also get **Matrix** and **Service types**:

1. **Service types:** set up each kind of service once, with its time, positions, and **Reminder email** (how many days before, 2 unless you change it).
2. **Make services:** create the next weeks in one step, repeating every 1 to 4 weeks. Dates that already have this service are skipped.
3. **Matrix:** the next services side by side. Open a cell to schedule someone. **Auto-schedule open spots** suggests someone for each open place, with the reason beside each name: only the position's team, never anyone blocked out, serving that day, or who declined that place, within how often each person asked to serve, with or apart from their household as they asked, trained first, then whoever served least recently. Nobody is added until you choose **Keep these**, and nobody is emailed until you send requests. **Discard** clears the suggestions.
4. **Edit details:** on a service's page, change its name, day, times, location, or notes. If the day or start time changes, everyone on it gets a short email.

**New service** on Schedule makes one service: choose the day, the **Service type** (such as Sunday Service, Holy Communion Service, or Thanksgiving Service), and the **Plan**. The type brings its positions, time, and reminder. The plan brings the order of service, and it's the type's usual plan unless you choose another.

### Order of service and plan templates

On a service's page, **Order of service and times** opens its plan:

- **Items:** items, songs, and section headers, each with a length such as 4:30. The running time and the clock time each item starts add up as you type. Use the arrows to reorder. **Add note** puts a note on an item for one department, such as "Cam 1 tight on the speaker" for Camera Operations. Choose **Save order of service** when you're done. The Service Dashboard and the wall TV show it straight away.
- **Use this plan** replaces the order with a plan template's, and you can change anything after.
- **Save as a template** keeps this order for other services.
- **Other times:** rehearsals and sound checks on the same day. They show in requests, reminders, and calendars.
- **Files:** stage plots, run sheets, and the like, up to 10 MB each (PDF, images, Word, Excel, PowerPoint, or text). Only schedulers and the people asked to serve at that service can open them.

**Plan templates**, a tab on Schedule, lists the saved orders of service. Open one to change it, **Duplicate** it, or **Archive** it. Changing a template never changes services already planned. On a service type, **Usual plan** chooses the template its new services start with.

While Planning Center schedules, a service's order of service is shown read only, as Planning Center has it.

On a service's page:

- **Places:** each position shows how many people it needs, such as "Camera 2, 1 of 2 filled". **Need one more** adds a place and **Need one fewer** removes an empty one. **Add position** adds one the service doesn't have yet.
- **Add someone:** only the position's team is listed. Someone blocked out, or already in another position that day, can still be added. A **Conflict** note then shows their other position or their blockout note, as in Planning Center. Nothing is blocked. You can pair someone still learning with **Someone alongside**.
- **Blockouts:** volunteers block out one day, a date range, part of a day, or a repeating day such as every 1st Sunday. A part-of-a-day blockout only counts if it overlaps the service. If someone blocks out a service they're already on, you're told.
- **Not sent yet:** people you add aren't emailed straight away. When you're ready, **Send requests** emails each person once, for everything they're on at that service, with your message if you add one. Untick anyone you want to hold back. Each send is in the audit log.
- **Reminders to confirm** go 48 hours after the request was sent, if there's still no reply.
- **Reminder email:** choose how many days before the service (1 to 7) everyone who accepted gets their "Serving soon" reminder, at 10:00 a.m. The page shows the day it goes out. Set the usual number on the service type, and change it for one service on that service's page.
- **When someone declines,** you're told, and the Academy adds the best free person from that position's team and asks them. That's someone who isn't blocked out or serving that day and hasn't already declined, trained first, then whoever served least recently. Their place shows "Added automatically after … declined". If nobody is free, the place stays open and you're told that instead.
