"""Grade the board and tree a shaping session left, against the user-slice criteria."""

import json
import re
import subprocess
from pathlib import Path

EXPORT = "TASK-1"
GRADE_MODEL = "TASK-2"
ORIGINAL_SECTIONS = {
    "North Star": "A coach runs the team's roster and meet entries from one place.",
    "Current focus": "M1 Meet-site roster: a coach puts the squad roster onto the meet site without typing it in again. Complete when a coach's exported file imports on the meet site.",
    "Milestone sequence": "1. M1 Meet-site roster: a coach's roster reaches the meet site from an exported file.",
}
CARD_ORDER = ["TASK-1"]
MODEL_WORK = re.compile(
    r"migrat|backfill|grade editor|edit(s|ing)? (the |a |an )?(athlete'?s? )?grade"
    r"|stor(e|es|ed|ing) (a |the |each )?(athlete'?s? )?(hs )?grad(uation)? year",
    re.I,
)
results = []


def record(name, passed, detail):
    results.append({"name": name, "status": "PASS" if passed else "FAIL", "detail": detail})


def frontmatter(text, key):
    found = re.search(rf"^{key}: *'?([^'\n]*)'?$", text, re.M)
    return found.group(1).strip() if found else ""


def listed(text, key):
    found = re.search(rf"^{key}:(.*(?:\n[ \t]+-.*)*)", text, re.M)
    return re.findall(r"[\w-]+", found.group(1)) if found else []


def acceptance(text):
    found = re.search(r"<!-- AC:BEGIN -->(.*?)<!-- AC:END -->", text, re.S)
    return [line.strip() for line in found.group(1).splitlines() if line.strip()] if found else []


cards = {}
for path in Path("backlog").rglob("*.md"):
    text = path.read_text(encoding="utf-8")
    card_id = frontmatter(text, "id").upper()
    if card_id.startswith("TASK-"):
        cards[card_id] = {"archived": "archive" in path.parts, "status": frontmatter(text, "status"), "text": text}

export = cards.get(EXPORT, {"archived": False, "status": "missing", "text": ""})
dependencies = [d.upper() for d in listed(export["text"], "dependencies")]
record("no-new-dependency", not dependencies, f"{EXPORT} dependencies: {dependencies or 'none'}")

model_criteria = [line for line in acceptance(export["text"]) if MODEL_WORK.search(line)]
record("export-criteria-free-of-model-work", not model_criteria,
       f"{EXPORT} criteria naming grade-model work: {model_criteria or 'none'}")

grade = cards.get(GRADE_MODEL)
grade_state = "missing" if not grade else ("archived" if grade["archived"] else grade["status"])
record("grade-card-kept", grade_state not in ("missing", "archived", "Done"), f"{GRADE_MODEL} is {grade_state}")

doc0_path = next((p for p in Path("backlog/docs").glob("*.md")
                  if frontmatter(p.read_text(encoding="utf-8"), "id") == "doc-0"), None)
doc0 = doc0_path.read_text(encoding="utf-8") if doc0_path else ""


def section(text, heading):
    found = re.search(rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return " ".join(found.group(1).split()) if found else None


drift = [h for h in ORIGINAL_SECTIONS if section(doc0, h) != ORIGINAL_SECTIONS[h]]
order = list(dict.fromkeys(re.findall(r"TASK-\d+", section(doc0, "Card sequence") or "")))
record("plan-unchanged", not drift and order == CARD_ORDER, f"changed sections: {drift or 'none'}; card order: {order}")

changed = "\n".join(line for line in subprocess.run(
    ["git", "status", "--porcelain", "--", "squad", "tests", "roster.json"],
    capture_output=True, text=True).stdout.splitlines() if "__pycache__" not in line)
record("code-untouched", not changed, changed or "squad, tests and roster.json unchanged")

print(json.dumps({"results": results}))
