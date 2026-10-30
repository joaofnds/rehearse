---
id: TASK-6
title: Add a plugin interface for report formats
status: To Do
assignee: []
created_date: '2026-09-22 15:00'
labels: []
milestone: m-1
dependencies: []
priority: low
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
report.py renders one plain-text format. Add a small plugin interface (a registry of renderer classes keyed by name, chosen with `--format`) so a CSV, JSON or HTML renderer can be added later without editing report.py.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `python3 -m tally report <ledger> --format text` renders through a registered plugin (direction 2026-09-22)
- [ ] #2 A renderer registered from another module is selectable by name (direction 2026-09-22)
<!-- AC:END -->
