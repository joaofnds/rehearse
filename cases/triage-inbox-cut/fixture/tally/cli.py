"""Command line entry point: `python3 -m tally <command> <ledger>`."""

import argparse

from tally import report, summary


def main(argv=None):
    parser = argparse.ArgumentParser(prog="tally")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, command in (("report", report), ("summary", summary)):
        command_parser = commands.add_parser(name)
        command.add_arguments(command_parser)
        command_parser.set_defaults(run=command.run)
    args = parser.parse_args(argv)
    args.run(args)
