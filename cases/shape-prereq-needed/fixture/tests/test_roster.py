import unittest
from datetime import date

from squad.roster import Athlete, GradeEntry


def athlete(*grades):
    return Athlete("Maya", "Chen", "F", None, tuple(grades), None)


class GradeLevelTest(unittest.TestCase):
    def test_reads_the_newest_grade_entry(self):
        maya = athlete(GradeEntry(9, date(2024, 8, 20)), GradeEntry(10, date(2025, 8, 21)))

        self.assertEqual(maya.grade_level(), 10)

    def test_reads_none_without_a_grade(self):
        self.assertIsNone(athlete().grade_level())


if __name__ == "__main__":
    unittest.main()
