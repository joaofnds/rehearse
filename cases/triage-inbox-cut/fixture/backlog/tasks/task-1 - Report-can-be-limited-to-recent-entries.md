---
id: TASK-1
title: Report can be limited to recent entries
status: To Do
assignee: []
created_date: '2026-09-20 12:05'
labels: []
milestone: m-1
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
People with long ledgers only read the current month. Give the report command a `--since YYYY-MM-DD` option that limits it to entries on or after that day.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `python3 -m tally report <ledger> --since 2026-03-01` lists only the entries dated on or after 2026-03-01 (direction 2026-09-20)
- [ ] #2 The TOTAL line sums only the listed entries (direction 2026-09-20)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Open decision: whether --since also takes a month name such as 'march'. Asked 2026-09-22, no answer yet. It does not block the date form.
<!-- SECTION:NOTES:END -->
