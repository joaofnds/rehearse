---
id: TASK-6
title: Summary counts the first entry of the ledger twice
status: Inbox
assignee: []
created_date: '2026-09-23 12:05'
labels: []
dependencies: []
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen while running summary on ledger.txt: gifts shows 70.0 though the only gifts entry is 35.00. total_by_category in tally/ledger.py seeds the totals with the first entry and then adds it again in the loop. Possible consequence: the first category's total is wrong on every ledger. Uncertain: none.
<!-- SECTION:DESCRIPTION:END -->
