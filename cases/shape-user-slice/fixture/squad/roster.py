import json
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class GradeEntry:
    level: int
    assigned_at: date


@dataclass(frozen=True)
class Athlete:
    first_name: str
    last_name: str
    gender: str
    birthdate: date | None
    grades: tuple[GradeEntry, ...]
    meetsite_id: str | None

    def grade_level(self):
        if not self.grades:
            return None

        return self.grades[-1].level


def load_roster(path):
    with open(path, encoding="utf-8") as file:
        records = json.load(file)

    return [_athlete(record) for record in records]


def _athlete(record):
    birthdate = record.get("birthdate")
    grades = tuple(
        GradeEntry(entry["level"], date.fromisoformat(entry["assigned_at"]))
        for entry in record.get("grades", [])
    )
    return Athlete(
        first_name=record["first_name"],
        last_name=record["last_name"],
        gender=record["gender"],
        birthdate=date.fromisoformat(birthdate) if birthdate else None,
        grades=grades,
        meetsite_id=record.get("meetsite_id"),
    )
