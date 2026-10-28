---
id: TASK-17
title: test_ledger leaves a temporary ledger file behind on every run
status: Inbox
assignee: []
created_date: '2026-09-26 12:05'
labels: []
dependencies: []
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in the code review of TASK-2's build on 2026-09-24: tests/test_ledger.py writes its sample ledger with `NamedTemporaryFile(delete=False)` and never removes it, so each `make test` leaves one small .txt file in the system temp directory. Reproduced: one run left a tmp*.txt file holding the two-line sample ledger. Possible consequence: temp files pile up on a developer machine or CI runner over time. Uncertain: whether anything cleans that directory.
<!-- SECTION:DESCRIPTION:END -->
