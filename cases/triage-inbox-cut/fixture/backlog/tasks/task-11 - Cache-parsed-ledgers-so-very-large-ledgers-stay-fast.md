---
id: TASK-11
title: Cache parsed ledgers so very large ledgers stay fast
status: Inbox
assignee: []
created_date: '2026-09-22 12:05'
labels: []
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by reading tally/cli.py: every command re-reads and re-parses the whole ledger. A ledger with millions of lines would make each command slow. Possible consequence: slow commands on large ledgers. Uncertain: the bundled ledger has five entries and no timing was taken.
<!-- SECTION:DESCRIPTION:END -->
