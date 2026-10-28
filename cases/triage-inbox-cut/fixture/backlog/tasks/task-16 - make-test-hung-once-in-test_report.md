---
id: TASK-16
title: make test hung once in test_report
status: Inbox
assignee: []
created_date: '2026-09-26 12:05'
labels: []
dependencies: []
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen during TASK-2's build on 2026-09-24: the session's first `make test` stopped in tests/test_report.py until its 120-second command timeout killed it. Not reproduced: the same session's next four `make test` runs passed in under a second each, and `python3 -m unittest tests.test_report` passed alone three times. Possible consequence: a check that hangs at random teaches readers to rerun it until it passes, and would slow every build. Uncertain: what made that one run hang.
<!-- SECTION:DESCRIPTION:END -->
