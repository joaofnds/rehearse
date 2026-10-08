---
id: TASK-5
title: Report and summary print 35.00 as 35.0
status: Inbox
assignee: []
created_date: '2026-09-22 12:05'
labels: []
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen while running the report on ledger.txt: the Flowers entry of 35.00 prints as `35.0` and Rent share as `640.0`. format_cents in tally/report.py builds the cents part with `cents % 100`, which drops the leading zero. Possible consequence: a household misreads amounts. Uncertain: none, it reproduces on the bundled ledger.
<!-- SECTION:DESCRIPTION:END -->
