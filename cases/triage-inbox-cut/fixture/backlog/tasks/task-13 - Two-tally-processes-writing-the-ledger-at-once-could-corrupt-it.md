---
id: TASK-13
title: Two tally processes writing the ledger at once could corrupt it
status: Inbox
assignee: []
created_date: '2026-09-24 12:05'
labels: []
dependencies: []
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by reading tally/ledger.py: nothing locks the ledger file, so two processes writing it concurrently could interleave lines. Possible consequence: a corrupted ledger. Uncertain: not reproduced.
<!-- SECTION:DESCRIPTION:END -->
