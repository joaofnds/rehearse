---
id: TASK-18
title: Nothing tests that load_entries skips blank lines
status: Inbox
assignee: []
created_date: '2026-09-26 12:05'
labels: []
dependencies: []
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Noted in the code review of TASK-2's build on 2026-09-24: tests/test_ledger.py feeds load_entries one comment and one entry, so deleting the blank-line check in tally/ledger.py leaves `make test` green. load_entries skips blank lines correctly today. Possible consequence: a later change could drop the check unnoticed, and a ledger with a blank line would then stop the report with a traceback. Uncertain: none, the gap is one missing test.
<!-- SECTION:DESCRIPTION:END -->
