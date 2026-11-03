# Decision: SOPs for all of production, and a cleaner library (2026-11-03)

**Status:** decided by G, 2026-11-03, after the clickable mock.

## What changes

- **SOPs don't have to belong to a department.** Some procedures, such as how to do a copyright review, are for everyone. When adding an SOP, **Who it's for** can be **All of production**.
- **The library is one list, grouped by category.** Categories collapse, and can be filtered. They can be chosen or created when adding an SOP. They're still free text, as they were (SRS-SOP-001).
- **The admin library's type was one step smaller** at first. Those sizes then became [the whole app's](2026-11-03-ui-consistency.md).

## Who can do what

- **Reading:** anyone active can read the current version of an all-of-production SOP, as with the rest of the training ([open training](2026-11-01-open-training.md)).
- **Managing:** adding, editing, publishing, reviewing and archiving need an organisation-wide grant of `course.draft` or `course.publish`. Today that's the Production Director and Platform Administrators.
- **Department leaders** can read these SOPs and attach them to their lessons, but can't change them.

## Platform Administrators

G decided Platform Administrators should draft and publish training. The role now holds `course.draft` and `course.publish`, organisation-wide, so this reaches every department's curriculum and SOPs as well as these. It replaces the earlier rule that the role doesn't publish training. They still don't approve memberships.

## The volunteer SOPs page

G asked for this page to stay usable at 50 to 100 SOPs, and approved a second mock:

- Compact rows replace cards, with a category menu beside them, or a dropdown on phones.
- Each category previews 4 SOPs, with **See all**.
- Search works as you type, across titles, summaries and categories, and highlights what matched.
- **Recently updated** lists the last 10 published.
- Only **Review due** is labelled, so it stands out. Owner and summary move to each SOP's own page.
- Its department filter includes **All of production**.

## Writing SOPs in the app

G asked for SOPs to be written in the app as well as uploaded, and approved a mock of a redesigned SOP page:

- A version holds written steps, a file, or both, and needs at least one to be published.
- One action bar holds **Save draft** and **Publish**, with details, the file, and history beside the document.
- Publishing saves what's on the screen, then asks what changed.
- The steps use the same safe formatter as the guides, so nothing in them can run as HTML, and links only go to web addresses.
- Replacing or removing a file on a draft leaves older versions' files in place.

## Deleting archived SOPs

G asked to be able to delete archived SOPs. Only someone who can publish for that department can, and it's refused while a live or draft course lists the SOP. A link on an old, replaced course version goes with it, so an old version restored by rollback would no longer list that SOP. The audit log keeps the title. Progress, quiz, assessment, and certificate history doesn't link to SOPs, so it isn't affected.

## In the database

`sops.department_id` and `sop_versions.department_id` can now be null. Files for these SOPs are stored at `<sop id>/<sop id>/<file id>`. See migration `20261219120000_sops_all_production.sql`. `sop_versions.body` holds the written steps, up to 50,000 characters (`20261220120000_sop_written_steps.sql`).
