"""The summary command: one total per category."""

from tally.ledger import load_entries, total_by_category
from tally.report import format_cents


def add_arguments(parser):
    parser.add_argument("ledger", help="path to the ledger file")


def run(args):
    totals = total_by_category(load_entries(args.ledger))
    for category, cents in sorted(totals.items()):
        print(f"{category:<16} {format_cents(cents):>10}")
