---
id: TASK-3
title: Replace the hand-split ledger parser with a grammar
status: To Do
assignee: []
created_date: '2026-09-21 09:10'
labels: []
milestone: m-1
dependencies: []
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
load_entries in tally/ledger.py splits each line on '|' by hand. Replace it with a parser generated from a grammar (lark), so a new ledger field is one grammar rule and every parse error names its line and column. Plan, one phase per session: (1) add lark as a dependency and pin it, (2) write the grammar for the current line format, (3) port load_entries to the grammar, (4) move the tests to the new parser and add error-message tests, (5) delete the hand parser.

Why before the period filters: both filters compare entry dates, and the hand-split parser is fragile, as Ana's crash on a pipe in a description shows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 load_entries parses through the grammar and the hand parser is gone (direction 2026-09-21)
- [ ] #2 A malformed line raises an error naming its line and column (direction 2026-09-21)
<!-- AC:END -->
