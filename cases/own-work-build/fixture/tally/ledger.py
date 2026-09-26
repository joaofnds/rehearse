"""Reading the ledger file."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Entry:
    day: date
    description: str
    category: str
    cents: int


def load_entries(path):
    """Read a ledger: one `YYYY-MM-DD | description | category | amount` per line."""
    entries = []
    with open(path, encoding="utf-8") as ledger:
        for line in ledger:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            day, description, category, amount = (part.strip() for part in line.split("|"))
            entries.append(Entry(date.fromisoformat(day), description, category, to_cents(amount)))
    return entries


def to_cents(amount):
    return int(Decimal(amount) * 100)


def total_by_category(entries):
    """Sum each category's entries, in cents."""
    totals = {entries[0].category: entries[0].cents}
    for entry in entries:
        totals[entry.category] = totals.get(entry.category, 0) + entry.cents
    return totals
