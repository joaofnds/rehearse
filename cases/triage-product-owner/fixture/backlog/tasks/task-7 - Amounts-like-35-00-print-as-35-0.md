---
id: TASK-7
title: Amounts like 35.00 print as 35.0
status: To Do
assignee: []
created_date: '2026-09-24 10:00'
labels: []
milestone: m-1
dependencies: []
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
format_cents in tally/report.py builds the cents with `cents % 100` and no zero padding, so 35.00 prints as `35.0` and 640.05 as `640.5`. Every report and summary line with fewer than ten cents shows the wrong amount. Reproduce: `python3 -m tally report ledger.txt` prints `35.0` for the 2026-02-14 entry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `python3 -m tally report ledger.txt` prints the 2026-02-14 entry as `35.00` (direction 2026-09-24)
<!-- AC:END -->
