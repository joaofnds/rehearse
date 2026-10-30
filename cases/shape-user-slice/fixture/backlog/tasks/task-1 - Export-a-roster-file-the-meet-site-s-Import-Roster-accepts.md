---
id: TASK-1
title: Export a roster file the meet site's Import Roster accepts
status: To Do
assignee: []
created_date: '2026-09-11 10:20'
updated_date: '2026-09-24 09:40'
labels: []
milestone: m-1
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A coach exports the squad roster as a file the meet site's Import Roster accepts, so athletes reach the meet-site team roster without being typed in again.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Source

Raised 2026-09-11 while reading the meet site's coach help pages: "the only coach-side file import they document is the roster template. We should be able to export in that format."

## Evidence

docs/meetsite-roster-import.md. Four required columns, an optional birthday, no meet entry, no per-meet state. squad already holds first name, last name, gender and birthdate.

## HS Grad Year: checked, and it is derivable (2026-09-11)

squad stores a grade, not a graduation year: squad/roster.py keeps each grade as a level with the date it was entered. A graduation year is computable from a level plus that date, so no new stored field is needed. Two things to settle when this is shaped:

- The school-year boundary. A level entered in the spring and the same level read in the autumn imply different graduation years, so the derivation needs a school-year rule rather than a calendar one.
- Middle-school athletes. The meet site wants the high-school graduation year even for them, so a level below 9 extrapolates forward.

An athlete with no grade has no derivable graduation year and cannot be exported. That is the roster equivalent of the entry file's blocked list: name the athlete and point at the fix.

## Admitted 2026-09-23

Typed direction: "2. accept", answering "Accept TASK-1 as the M1 milestone and start planning it? I recommend yes: it's cheap and it's the only file route into the meet site we know works."

## Finding 2026-09-23 (TASK-2)

The HS Grad Year this export writes would be derived from a grade that squad never advances between school years, and that can be missing with no way for a coach to set it. The meet site cannot delete an imported athlete, so a wrong graduation year is permanent there. Settle TASK-2's grade model before this card writes a graduation year.
<!-- SECTION:NOTES:END -->
