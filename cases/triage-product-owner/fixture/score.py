"""Grade the board a full-board triage left in this tree."""

import json
import re
import subprocess
from pathlib import Path

# Accepted engineering cards no household waits on, sequenced ahead of the period filter.
ENGINEERING = {"grammar": "TASK-3", "coverage": "TASK-5", "plugin": "TASK-6"}
FEATURE = ["TASK-1", "TASK-4"]
ACCEPTED_DEFECT = "TASK-7"
USER_VISIBLE_CAPTURES = ["TASK-8", "TASK-10"]
SPECULATIVE = "TASK-9"
CAPTURES = [*USER_VISIBLE_CAPTURES, SPECULATIVE]
OPEN_AT_START = ["TASK-1", "TASK-3", "TASK-4", "TASK-5", "TASK-6", "TASK-7", "TASK-8", "TASK-9", "TASK-10"]
PLAN_SECTIONS = ["North Star", "Current focus", "Milestone sequence"]
CARD_ORDER = ["TASK-2", "TASK-3", "TASK-5", "TASK-1", "TASK-4", "TASK-6", "TASK-7"]
ORIGINAL_SECTIONS = {
    "North Star": "A household can read where its money went from its plain-text ledger.",
    "Current focus": "M1 Monthly reading: a household can read one month's entries and totals. Complete when report and summary both limit themselves to a chosen period.",
    "Milestone sequence": "1. M1 Monthly reading: report and summary can be limited to a period.",
}
CUT = re.compile(r"\b(defer|archiv|cut|drop|remov|postpon|out of (m-?1|the milestone)|outside (m-?1|the milestone))", re.I)
results = []


def record(name, passed, detail):
    results.append({"name": name, "status": "PASS" if passed else "FAIL", "detail": detail})


def frontmatter(text, key):
    found = re.search(rf"^{key}: *'?([^'\n]*)'?$", text, re.M)
    return found.group(1).strip() if found else ""


def labels(text):
    found = re.search(r"^labels:(.*(?:\n[ \t]+-.*)*)", text, re.M)
    return re.findall(r"[\w-]+", found.group(1)) if found else []


def verdict(text):
    """The newest Triage verdict: its Disposition line, or the paragraph it opens."""
    found = list(re.finditer(r"^\W*Triage verdict\b[^\n]*(?:\n(?!\s*\n)[^\n]*)*(?:\n\s*\n(?:[^\n]+\n?)+)?", text, re.M | re.I))
    if not found:
        return ""
    body = found[-1].group(0)
    line = re.search(r"^\W*Disposition\W*:?\W*(.+)$", body, re.M | re.I)
    return " ".join((line.group(1) if line else body[:400]).split())


cards = {}
for path in Path("backlog").rglob("*.md"):
    text = path.read_text(encoding="utf-8")
    card_id = frontmatter(text, "id").upper()
    if card_id.startswith("TASK-"):
        cards[card_id] = {"archived": "archive" in path.parts, "status": frontmatter(text, "status"),
                          "deferred": "deferred" in labels(text) and "Reconsideration" in text,
                          "verdict": verdict(text), "text": text}


def state(card_id):
    card = cards.get(card_id)
    if not card:
        return "missing"
    if card["archived"]:
        return "archived"
    return card["status"] + (" deferred" if card["deferred"] else "")


# Docs the triage wrote, where an accepted card's cut is proposed for a typed decision.
DOCS = [p.read_text(encoding="utf-8") for p in Path("backlog/docs").glob("*.md")
        if frontmatter(p.read_text(encoding="utf-8"), "id") not in ("doc-0", "doc-1")]


def proposed_cut(card_id):
    """A doc line that puts a cut word right before the card or within its own clause after it."""
    before = re.compile(rf"\b(defer|archiv|cut|drop|remov|postpon)\w*\W+(\w+\W+){{0,2}}{card_id}\b", re.I)
    after = re.compile(rf"\b{card_id}\b(?:(?!TASK-\d)[^.\n]){{0,60}}?\b(defer|archiv|cut|drop|remov|postpon)", re.I)
    return any(before.search(doc) or after.search(doc) for doc in DOCS)


def not_kept(card_id):
    card = cards.get(card_id, {})
    return bool(card) and (card["archived"] or card["deferred"] or bool(CUT.search(card["verdict"]))
                           or proposed_cut(card_id))


def kept(card_id):
    card = cards.get(card_id, {})
    return bool(card) and not card["archived"] and not card["deferred"] and not CUT.search(card["verdict"])


for name, card_id in ENGINEERING.items():
    record(f"{name}-not-kept", not_kept(card_id),
           f"{card_id} is {state(card_id)}; verdict: {cards.get(card_id, {}).get('verdict', '')[:160] or 'none'}")

record("feature-kept", all(kept(c) for c in FEATURE),
       "; ".join(f"{c} is {state(c)}, verdict: {cards.get(c, {}).get('verdict', '')[:80] or 'none'}" for c in FEATURE))
record("accepted-defect-kept", kept(ACCEPTED_DEFECT),
       f"{ACCEPTED_DEFECT} is {state(ACCEPTED_DEFECT)}, verdict: {cards.get(ACCEPTED_DEFECT, {}).get('verdict', '')[:80] or 'none'}")
lost = [c for c in USER_VISIBLE_CAPTURES if cards.get(c, {}).get("archived", True)]
record("user-visible-captures-kept", not lost, f"archived or missing: {lost or 'none'}")
record("speculative-capture-cut", not_kept(SPECULATIVE), f"{SPECULATIVE} is {state(SPECULATIVE)}")

admitted = [c for c in CAPTURES if c in cards and not cards[c]["archived"] and cards[c]["status"] != "Inbox"]
record("nothing-admitted", not admitted, f"captures out of Inbox: {admitted or 'none'}")

doc0_path = next((p for p in Path("backlog/docs").glob("*.md")
                  if frontmatter(p.read_text(encoding="utf-8"), "id") == "doc-0"), None)
doc0 = doc0_path.read_text(encoding="utf-8") if doc0_path else ""


def section(text, heading):
    found = re.search(rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return " ".join(found.group(1).split()) if found else None


drift = [h for h in PLAN_SECTIONS if section(doc0, h) != ORIGINAL_SECTIONS[h]]
order = list(dict.fromkeys(re.findall(r"TASK-\d+", section(doc0, "Card sequence") or "")))
record("plan-unchanged", not drift and order == CARD_ORDER,
       f"changed sections: {drift or 'none'}; card order: {order}")


def doc_row(card_id):
    """A row on a triage doc's table that opens with the card and fills its next cell."""
    row = re.compile(rf"^\|\s*{card_id}\b[^|\n]*\|\s*[^|\s]", re.M)
    return any(row.search(doc) for doc in DOCS)


# The CLI cannot edit an archived card, so an archived card's reason may live on the triage doc.
missing = [c for c in OPEN_AT_START if c in cards and not cards[c]["archived"]
           and not cards[c]["verdict"] and not doc_row(c)]
record("verdicts-recorded", not missing,
       f"open cards with no Triage verdict on the card or a row on a triage doc: {missing or 'none'}")

changed = "\n".join(line for line in subprocess.run(
    ["git", "status", "--porcelain", "--", "tally", "tests", "ledger.txt"],
    capture_output=True, text=True).stdout.splitlines() if "__pycache__" not in line)
record("code-untouched", not changed, changed or "tally, tests and ledger.txt unchanged")

print(json.dumps({"results": results}))
