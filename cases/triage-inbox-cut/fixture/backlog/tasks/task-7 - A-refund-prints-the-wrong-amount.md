---
id: TASK-7
title: A refund prints the wrong amount
status: Inbox
assignee: []
created_date: '2026-09-24 12:05'
updated_date: '2026-09-24 12:05'
labels: []
dependencies: []
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The bundled ledger.txt holds `2026-03-20 | Grocery refund | groceries | -18.40`, and the report prints it as -19.60. format_cents floors negative cents. Possible consequence: refunds read as larger than they were, and the TOTAL is off. Uncertain: none, it reproduces on the bundled ledger.
<!-- SECTION:DESCRIPTION:END -->
