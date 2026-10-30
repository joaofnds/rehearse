import sys

from squad.entries import write_entries
from squad.roster import load_roster

ROSTER = "roster.json"


def main(argv):
    if not argv:
        print("usage: python3 -m squad roster | entries", file=sys.stderr)
        return 2

    athletes = load_roster(ROSTER)

    if argv[0] == "roster":
        for athlete in athletes:
            level = athlete.grade_level()
            print(f"{athlete.last_name}, {athlete.first_name}  grade {level if level else '-'}")
        return 0

    if argv[0] == "entries":
        blocked = write_entries(athletes, sys.stdout)
        for line in blocked:
            print(f"blocked: {line}", file=sys.stderr)
        return 0

    print(f"unknown command: {argv[0]}", file=sys.stderr)
    return 2
