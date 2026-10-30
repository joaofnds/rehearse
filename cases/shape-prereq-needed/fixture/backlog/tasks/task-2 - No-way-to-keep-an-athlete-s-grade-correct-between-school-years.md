---
id: TASK-2
title: No way to keep an athlete's grade correct between school years
status: Shape
assignee: []
created_date: '2026-09-22 15:05'
updated_date: '2026-09-23 18:30'
labels:
  - investigate:debug
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Symptom: a coach told to fix a missing grade has nowhere in squad to set one. The only place a grade is written is when the coach adds the athlete.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Admitted as an investigation 2026-09-23

Typed direction: "Look at this as a product owner. Who keeps an athlete's grade correct on a cross-country team, and is a coach setting it a real use case?"

Question: who keeps an athlete's grade correct, how often does it change, and does that make a coach setting it a real use case for squad?
Budget: one session.
Stopping condition: an answer with sources to who owns the value, plus every path by which an athlete can reach an export with no grade or a stale one.

## Answered 2026-09-23, awaiting the operator's decision on the model

In the field the coach keeps the roster grade correct: on the meet site coaches edit it and athletes can only suggest a correction.

The larger finding is in the code. squad stores a grade that nothing advances between school years. Athlete.grade_level() returns the newest stored level as it was entered, and nothing reads the date stored beside it, so every grade goes stale each school year and the meet entry file writes the stale value today. Imported athletes carry the import date, 2026-09-05, with the grade of their newest meet-site season, so for them the stored date says nothing about which school year the grade belongs to. That rules out deriving a graduation year from the stored date: 6 of the 14 athletes are imports (count of roster.json entries with a meetsite_id, 2026-09-23).

Hand-added grades are no better. The coach added every returning athlete in August 2026 with last season's grade copied from the team spreadsheet, and every new athlete with this season's grade from the sign-up form, and squad does not record which is which (the coach's reply in the team chat, 2026-09-22). So for a hand-added athlete the stored level is either this season's or last season's, and nothing in squad says which.

Recommendation: store a graduation year on each athlete and derive the grade per school year. That means migrating every stored grade to a year, backfilling imported athletes from their meet-site seasons, adding a grade editor a coach can use, and choosing who may write the year: the athlete only, the athlete or any coach of the team, or coaches only. The choice of writer needs the operator's answer.
<!-- SECTION:NOTES:END -->
