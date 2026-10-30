---
id: TASK-10
title: Summary counts the ledger's first entry twice
status: Inbox
assignee: []
created_date: '2026-09-27 16:00'
labels: []
dependencies: []
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
total_by_category in tally/ledger.py seeds the totals with the first entry and then adds every entry, the first one included, so the first entry's category is overstated by that entry's amount. Reproduce: `python3 -m tally summary ledger.txt` prints gifts as 70.0 for one 35.00 entry.
<!-- SECTION:DESCRIPTION:END -->
