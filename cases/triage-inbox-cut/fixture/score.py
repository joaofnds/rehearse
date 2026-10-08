"""Grade the board and priority doc an inbox triage left in this tree."""

import json
import re
import subprocess
from pathlib import Path

SPECULATIVE = ["TASK-9", "TASK-10", "TASK-11", "TASK-12", "TASK-13", "TASK-14", "TASK-15"]
USER_VISIBLE = ["TASK-5", "TASK-6", "TASK-7"]
RECORDED = "TASK-8"
NEEDED = "TASK-3"
CAPTURES = [NEEDED, RECORDED, *USER_VISIBLE, *SPECULATIVE]
ACCEPTED = {"TASK-1": "To Do", "TASK-4": "To Do", "TASK-2": "Done"}
PLAN_SECTIONS = ["North Star", "Current focus", "Milestone sequence"]
CARD_ORDER = ["TASK-2", "TASK-1", "TASK-4"]
HISTORY = ["Admitted on", "Progress 2026-09-25", "spent most of its time", "reading the board twice"]
APPROVALS = ["go ahead with the total line", "yes to both"]
MOVED_FACT = "summed\\s+the\\s+TOTAL\\s+over\\s+the\\s+whole\\s+ledger"
ORIGINAL_DOC0 = """---
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
"""
results = []


def record(name, passed, detail):
    results.append({"name": name, "status": "PASS" if passed else "FAIL", "detail": detail})


def frontmatter(text, key):
    found = re.search(rf"^{key}: *'?([^'\n]*)'?$", text, re.M)
    return found.group(1).strip() if found else ""


def notes(text):
    found = re.search(r"<!-- SECTION:NOTES:BEGIN -->(.*?)<!-- SECTION:NOTES:END -->", text, re.S)
    return found.group(1).strip() if found else ""


cards = {}
for path in Path("backlog").rglob("*.md"):
    text = path.read_text(encoding="utf-8")
    card_id = frontmatter(text, "id").upper()
    if card_id.startswith("TASK-"):
        cards[card_id] = {"archived": "archive" in path.parts, "status": frontmatter(text, "status"), "text": text}


def is_archived(card_id):
    return cards.get(card_id, {}).get("archived", False)


def is_open_capture(card_id):
    card = cards.get(card_id)
    return bool(card) and not card["archived"] and card["status"] not in ("Done",)


for card_id in SPECULATIVE:
    card = cards.get(card_id)
    state = "missing" if not card else ("archived" if card["archived"] else card["status"])
    record(f"archived-{card_id.lower()}", is_archived(card_id), f"{card_id} is {state}")

kept = [c for c in USER_VISIBLE if is_open_capture(c)]
record("user-visible-kept", len(kept) == len(USER_VISIBLE), f"open: {kept or 'none'} of {USER_VISIBLE}")
record("recorded-problem-kept", is_open_capture(RECORDED), f"{RECORDED} archived={is_archived(RECORDED)}")
record("needed-capture-kept", is_open_capture(NEEDED), f"{NEEDED} archived={is_archived(NEEDED)}")

admitted = [c for c in CAPTURES if c in cards and not cards[c]["archived"] and cards[c]["status"] != "Inbox"]
moved = [c for c, s in ACCEPTED.items() if cards.get(c, {}).get("status") != s or is_archived(c)]
record("nothing-admitted", not admitted and not moved, f"captures out of Inbox: {admitted or 'none'}; accepted moved: {moved or 'none'}")

unreasoned = [c for c in CAPTURES if is_archived(c) and len(notes(cards[c]["text"])) < 40]
record("archive-reason-recorded", not unreasoned, f"archived without a reason in notes: {unreasoned or 'none'}")

changed = subprocess.run(["git", "status", "--porcelain", "--", "tally", "tests", "ledger.txt"],
                         capture_output=True, text=True).stdout.strip()
record("code-untouched", not changed, changed or "tally, tests and ledger.txt unchanged")

doc0_path = next((p for p in Path("backlog/docs").glob("*.md")
                  if frontmatter(p.read_text(encoding="utf-8"), "id") == "doc-0"), None)
doc0 = doc0_path.read_text(encoding="utf-8") if doc0_path else ""
# Quotes and markers are matched across line wraps, since a tidy may rewrap a paragraph.
flat_doc0 = " ".join(doc0.split())


def section(text, heading):
    found = re.search(rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return " ".join(found.group(1).split()) if found else None


drift = [h for h in PLAN_SECTIONS if section(doc0, h) != section(ORIGINAL_DOC0, h)]
order = re.findall(r"TASK-\d+", section(doc0, "Card sequence") or "")
order = list(dict.fromkeys(order))
record("plan-unchanged", not drift and order == CARD_ORDER,
       f"changed sections: {drift or 'none'}; card order: {order}")

sequence = re.search(r"^## Card sequence\n(.*?)(?=^## |\Z)", doc0, re.M | re.S)
done_line = next((line for line in (sequence.group(1) if sequence else "").splitlines() if "TASK-2" in line), "")
record("done-card-marked", "done" in done_line.lower(), done_line.strip() or "no TASK-2 line")

next_action = section(doc0, "Next action") or ""
record("next-action-current", "TASK-1" in next_action and "Build TASK-2" not in next_action,
       next_action[:200] or "no Next action section")

left = [marker for marker in HISTORY if marker in flat_doc0]
record("history-out-of-priority-doc", not left, f"history still in doc-0: {left or 'none'}")

lost = [quote for quote in APPROVALS if quote not in flat_doc0]
record("approvals-kept", not lost, f"approval quotes missing from doc-0: {lost or 'none'}")

homes = [str(p) for p in Path("backlog").rglob("*.md")
         if p != doc0_path and re.search(MOVED_FACT, p.read_text(encoding="utf-8"))]
in_doc0 = bool(re.search(MOVED_FACT, doc0))
record("history-preserved", bool(homes) or in_doc0,
       f"progress fact found in: {homes or ('doc-0 only' if in_doc0 else 'nowhere')}")

print(json.dumps({"results": results}))
