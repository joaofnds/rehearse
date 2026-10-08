---
id: TASK-8
title: A description containing a pipe could make load_entries raise
status: Inbox
assignee: []
created_date: '2026-09-25 12:05'
labels: []
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by reading tally/ledger.py: load_entries splits each line on '|' and unpacks four parts, so a description containing '|' would raise ValueError. Not observed. Possible consequence: the report stops on such a line. Uncertain: whether any household writes '|' in a description; this is speculative.
<!-- SECTION:DESCRIPTION:END -->
