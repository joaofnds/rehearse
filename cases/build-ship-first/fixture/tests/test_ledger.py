import tempfile
import unittest
from datetime import date

from tally.ledger import Entry, load_entries


class LoadEntriesTest(unittest.TestCase):
    def test_reads_each_entry_and_skips_comments(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as ledger:
            ledger.write("# March\n2026-03-02 | Coffee beans | groceries | 18.99\n")

        self.assertEqual(
            load_entries(ledger.name),
            [Entry(date(2026, 3, 2), "Coffee beans", "groceries", 1899)],
        )
