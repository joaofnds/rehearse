---
id: TASK-4
title: Summary can be limited to recent entries
status: To Do
assignee: []
created_date: '2026-09-20 12:06'
labels: []
milestone: m-1
dependencies: []
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give the summary command the same `--since YYYY-MM-DD` option as the report, so a household can read one month's category totals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `python3 -m tally summary <ledger> --since 2026-03-01` totals only entries dated on or after 2026-03-01 (direction 2026-09-20)
<!-- AC:END -->
