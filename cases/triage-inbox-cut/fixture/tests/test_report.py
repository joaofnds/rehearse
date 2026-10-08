import unittest
from datetime import date

from tally.ledger import Entry
from tally.report import format_cents, render


class FormatCentsTest(unittest.TestCase):
    def test_whole_and_cents(self):
        self.assertEqual(format_cents(1234), "12.34")

    def test_thousands(self):
        self.assertEqual(format_cents(100050), "1000.50")


class RenderTest(unittest.TestCase):
    def test_lists_each_entry_then_the_total(self):
        entries = [
            Entry(date(2026, 3, 2), "Coffee beans", "groceries", 1899),
            Entry(date(2026, 3, 9), "Train ticket", "travel", 4250),
        ]

        self.assertEqual(
            render(entries).splitlines(),
            [
                "REPORT  2 entries",
                "03/02/2026  Coffee beans                  18.99",
                "03/09/2026  Train ticket                  42.50",
                "TOTAL                                     61.49",
            ],
        )
