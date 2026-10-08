---
id: TASK-10
title: Rename cents to amount_cents across the codebase
status: Inbox
assignee: []
created_date: '2026-09-21 12:05'
labels: []
dependencies: []
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while reading tally/ledger.py and report.py: the Entry field `cents` and local variables named `cents` could be clearer as `amount_cents`. Possible consequence: a reader might confuse cents with a whole amount. Uncertain: no defect traced to the name.
<!-- SECTION:DESCRIPTION:END -->
