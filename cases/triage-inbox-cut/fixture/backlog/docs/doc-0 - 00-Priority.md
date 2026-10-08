---
id: doc-0
title: 00 Priority
type: other
created_date: '2026-09-18 10:00'
updated_date: '2026-09-27 16:40'
---

# Project priorities

## North Star

A household can read where its money went from its plain-text ledger.

## Current focus

M1 Monthly reading: a household can read one month's entries and totals. Complete when
report and summary both limit themselves to a chosen period.

## Milestone sequence

1. M1 Monthly reading: report and summary can be limited to a period.

## Card sequence

### M1 Monthly reading

1. TASK-2 Report ends with the total of its entries.
2. TASK-1 Report can be limited to recent entries.
3. TASK-4 Summary can be limited to recent entries.

## Next action

Build TASK-2, the first card in M1's sequence.

Admitted on 2026-09-20: TASK-1 and TASK-4 at Medium, typed "yes to both" to the batch in
doc-1. TASK-1 raised to High on 2026-09-22 after a household asked for monthly reports.

Admitted on 2026-09-18: TASK-2 at Medium.

Progress 2026-09-25: TASK-2's build took two sessions because the first version summed
the TOTAL over the whole ledger instead of the listed entries. The second session fixed it
and review passed on the first round.

Open operator decisions, each held on its card and blocking nothing:

- TASK-1: whether --since also takes a month name such as 'march'.

## Deferred directions

None.

## Planning authority

- 2026-09-18: TASK-2 admitted, typed "go ahead with the total line". The session that
  admitted it spent most of its time reading report.py, where it found the total was
  missing, and it also looked at the summary command but left it for later after deciding
  it was out of scope for that pass. It noted on TASK-2 what it had read. Record: doc-1.
- 2026-09-20: TASK-1 and TASK-4 admitted and ordered after TASK-2, typed "yes to both" to
  doc-1's proposal. This delays nothing, since M1 held only TASK-2. TASK-2's build had
  already started in another session by then and carried on in parallel without any
  conflict, which the session checked by reading the board twice. Record: doc-1.
