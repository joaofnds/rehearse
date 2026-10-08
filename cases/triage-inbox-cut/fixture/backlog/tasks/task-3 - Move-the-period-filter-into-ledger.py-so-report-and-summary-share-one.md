---
id: TASK-3
title: Move the period filter into ledger.py so report and summary share one
status: Inbox
assignee: []
created_date: '2026-09-20 12:05'
labels: []
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while reading report.py for TASK-1. Once TASK-1 adds --since to report, TASK-4 needs the same filter for summary. Possible consequence: two copies of the date filter that drift apart. Uncertain: nothing reads the filter outside report yet, so this may be premature.
<!-- SECTION:DESCRIPTION:END -->
