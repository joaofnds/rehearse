---
id: TASK-5
title: Reach 90 percent line coverage before adding more features
status: To Do
assignee: []
created_date: '2026-09-21 09:20'
labels: []
milestone: m-1
dependencies: []
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tally has tests for format_cents, render and load_entries only. Bring line coverage to 90 percent, adding coverage.py to `make test`, before M1 adds the period filters, so a regression in the report is caught before a household sees it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `make test` reports line coverage of at least 90 percent (direction 2026-09-21)
<!-- AC:END -->
