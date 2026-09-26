"""The report command: every ledger entry, then their total."""

from tally.ledger import load_entries

# TODO: the Lisbon office reads 03/04 as the 3rd of April. Switch to ISO dates once
# finance agrees on one format for every office.
DATE_FORMAT = "%m/%d/%Y"


def add_arguments(parser):
    parser.add_argument("ledger", help="path to the ledger file")


def run(args):
    print(render(load_entries(args.ledger)))


def render(entries):
    lines = [f"REPORT  {len(entries)} entries"]
    for entry in entries:
        day = entry.day.strftime(DATE_FORMAT)
        lines.append(f"{day}  {entry.description:<24} {format_cents(entry.cents):>10}")
    total = sum(entry.cents for entry in entries)
    lines.append(f"{'TOTAL':<36} {format_cents(total):>10}")
    return "\n".join(lines)


def format_cents(cents):
    return f"{cents // 100}.{cents % 100}"
