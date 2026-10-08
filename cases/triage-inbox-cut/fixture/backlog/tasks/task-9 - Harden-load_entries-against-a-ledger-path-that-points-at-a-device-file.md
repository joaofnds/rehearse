---
id: TASK-9
title: Harden load_entries against a ledger path that points at a device file
status: Inbox
assignee: []
created_date: '2026-09-26 12:05'
labels: []
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by reading tally/ledger.py: load_entries opens whatever path it is given, so a path or symlink to /dev/zero or a FIFO would hang the command. Possible consequence: a hang if someone passes such a path. Uncertain: tally runs locally on the household's own file.
<!-- SECTION:DESCRIPTION:END -->
