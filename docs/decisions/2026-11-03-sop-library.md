# Decision: SOPs for all of production, and a cleaner library (2026-11-03)

**Status:** decided by G, 2026-11-03, after the clickable mock.

## What changes

- **SOPs don't have to belong to a department.** Some procedures, such as how to do a copyright review, are for everyone. When adding an SOP, **Who it's for** can be **All of production**.
- **The library is one list, grouped by category.** Categories collapse, and can be filtered. They can be chosen or created when adding an SOP. They're still free text, as they were (SRS-SOP-001).
- **The admin library's type is one step smaller**, on that page only: body 13px, small 11px.

## Who can do what

- **Reading:** anyone active can read the current version of an all-of-production SOP, as with the rest of the training ([open training](2026-11-01-open-training.md)).
- **Managing:** adding, editing, publishing, reviewing and archiving need an organisation-wide grant of `course.draft` or `course.publish`. Today that's the Production Director and Platform Administrators.
- **Department leaders** can read these SOPs and attach them to their lessons, but can't change them.

## Platform Administrators

G decided Platform Administrators should draft and publish training. The role now holds `course.draft` and `course.publish`, organisation-wide, so this reaches every department's curriculum and SOPs as well as these. It replaces the earlier rule that the role doesn't publish training. They still don't approve memberships.

## Also changed

The volunteer SOPs page has an **All of production** choice in its department filter, because these SOPs wouldn't otherwise have a department to filter by. Nothing else on that page changes.

## In the database

`sops.department_id` and `sop_versions.department_id` can now be null. Files for these SOPs are stored at `<sop id>/<sop id>/<file id>`. See migration `20261219120000_sops_all_production.sql`.
