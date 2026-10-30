---
id: TASK-8
title: A pipe in a description stops the report
status: Inbox
assignee: []
created_date: '2026-09-30 18:00'
labels: []
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ana Ribeiro's message of 2026-09-30 in support/2026-09.md: the report stopped with `ValueError: too many values to unpack (expected 4)` on `2026-09-28 | Fish | chips | eating out | 11.50` and printed nothing. load_entries splits each line on every '|'. Possible consequence: any household that writes '|' in a description sees no report at all. Uncertain: none, the message gives the failing line.
<!-- SECTION:DESCRIPTION:END -->
