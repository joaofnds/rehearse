---
id: TASK-4
title: Summary can be limited to recent entries
status: To Do
assignee: []
created_date: '2026-09-21 12:05'
labels: []
milestone: m-1
dependencies:
  - TASK-3
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give the summary command the same `--since YYYY-MM-DD` option as report, using the shared period filter from TASK-3, so a household can read one month's totals by category.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `python3 -m tally summary <ledger> --since 2026-03-01` totals only the entries dated on or after 2026-03-01 (direction 2026-09-20)
<!-- AC:END -->
