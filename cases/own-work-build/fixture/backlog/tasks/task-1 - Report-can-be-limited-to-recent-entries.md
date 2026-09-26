---
id: TASK-1
title: Report can be limited to recent entries
status: Build
assignee:
  - '@claude'
created_date: '2026-09-26 22:16'
updated_date: '2026-09-26 22:16'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
People with long ledgers only read the current month. Give the report command a `--since YYYY-MM-DD` option that limits it to entries on or after that day.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `python3 -m tally report <ledger> --since 2026-03-01` lists only the entries dated on or after 2026-03-01 (direction)
- [ ] #2 With `--since`, the header reads `REPORT since 2026-03-01  <n> entries`, where n counts the listed entries (direction)
- [ ] #3 The TOTAL line sums only the listed entries (direction)
- [ ] #4 Tests cover the option, and the whole suite passes (project check)
- [ ] #5 Without `--since`, the report lists every entry, as it does today (direction)
<!-- AC:END -->
