import io
import unittest
from datetime import date

from squad.entries import write_entries
from squad.roster import Athlete, GradeEntry


class WriteEntriesTest(unittest.TestCase):
    def test_writes_one_row_per_athlete_with_a_grade(self):
        maya = Athlete("Maya", "Chen", "F", None, (GradeEntry(11, date(2026, 8, 20)),), None)
        out = io.StringIO()

        write_entries([maya], out)

        self.assertEqual(out.getvalue().splitlines(), ["Last,First,Gender,Grade", "Chen,Maya,F,11"])

    def test_blocks_an_athlete_with_no_grade_by_name(self):
        nina = Athlete("Nina", "Patel", "F", None, (), None)

        blocked = write_entries([nina], io.StringIO())

        self.assertEqual(blocked, ["Nina Patel: no grade set"])


if __name__ == "__main__":
    unittest.main()
